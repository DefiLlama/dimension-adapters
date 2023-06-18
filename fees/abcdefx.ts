import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0: number;
  amount1: number;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
//const chains = ['fantom', 'kcc', 'echelon', 'multivac', 'kava']
const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

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


const fetch = async (timestamp: number, chain: Chain): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  try {
    const poolLength = (await sdk.api.abi.call({
      target: FACTORY_ADDRESS,
      chain: chain,
      abi: ABIs.allPairsLength,
    })).output;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: chain
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
          chain: chain
        })
      )
    );

    const tokens0 = underlyingToken0.output.map((res: any) => res.output);
    const tokens1 = underlyingToken1.output.map((res: any) => res.output);
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: chain,
      topics: [topic0]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => chain+`:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[chain+`:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[chain+`:${tokens1[index]}`]?.decimals || 0)
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
      const token0Price = (prices[chain+`:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[chain+`:${tokens1[index]}`]?.price || 0);

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

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graph(CHAIN.FANTOM),
      start: async () => 1677000000,
    },
    [CHAIN.KAVA]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async () => 1677000000,
    }
  }
};

export default adapter;
