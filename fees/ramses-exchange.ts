import { BreakdownAdapter, FetchResultFees, BaseAdapter } from "../adapters/types";

import { ARBITRUM, CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk/build";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../helpers/getUniSubgraph"


// V2 //

const v3Endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/ramsesexchange/concentrated-liquidity-graph",
};

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 100,
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 100 // Revenue is 75% of collected fees
  }
});

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Protocol have no revenue.",
  HoldersRevenue: "User fees are distributed among holders."
}

// V1 //

type TStartTime = {
  [key: string]: number;
}
const startTimeV3:TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
}

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0: number;
  amount1: number;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
const FACTORY_ADDRESS = '0xaaa20d08e59f6561f242b08513d36266c5a29415';

type TABI = {
  [k: string]: object;
}
const ABIs: TABI = {
  allPairsLength: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "allPairsLength",
    "inputs": []
  },
  allPairs: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "allPairs",
  }
};

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": token,
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
};


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const poolLength = (await sdk.api.abi.call({
      target: FACTORY_ADDRESS,
      chain: CHAIN.ARBITRUM,
      abi: ABIs.allPairsLength,
    })).output;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.ARBITRUM
    });

    const lpTokens = poolsRes.output
      .map(({ output }: any) => output);

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: CHAIN.ARBITRUM
        })
      )
    );

    const tokens0 = underlyingToken0.output.map((res: any) => res.output);
    const tokens1 = underlyingToken1.output.map((res: any) => res.output);
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.ARBITRUM,
      topics: [topic0]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.ARBITRUM}:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[`${CHAIN.ARBITRUM}:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.ARBITRUM}:${tokens1[index]}`]?.decimals || 0)
      const log: IAmount[] = logs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          const amount0 = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
          const amount1 = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals
          return {
            amount0,
            amount1
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`${CHAIN.ARBITRUM}:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.ARBITRUM}:${tokens1[index]}`]?.price || 0);

      const feesAmount0 = log
        .reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0)  * token0Price;
      const feesAmount1 = log
        .reduce((a: number, b: IAmount) => Number(b.amount1) + a, 0)  * token1Price;

      const feesUSD = feesAmount0 + feesAmount1;
      return feesUSD;
    });

    const dailyFees = fees.reduce((a: number, b: number) => a+b,0)
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue:  `${dailyFees}`,
      dailyHoldersRevenue: `${dailyFees}`,
      timestamp,
    };
  } catch(error) {
    console.error(error);
    throw error;
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
        [CHAIN.ARBITRUM]: {
          fetch,
          start: async () => 1678838400,
        },
        },
    v2: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(ARBITRUM),
        start: async () => startTimeV3[CHAIN.ARBITRUM],
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays 0.05%, 0.30%, or 1% on each swap."
          }
        }
      }
      return acc
    }, {} as BaseAdapter)
  }
}

export default adapter;
