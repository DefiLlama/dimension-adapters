import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import BigNumber from "bignumber.js";

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0: string;
  amount1: string;
}
const topic_name = 'Swap(index_topic_1 address sender, index_topic_2 address to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)';
const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
const FACTORY_ADDRESS = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a';

type TABI = {
  [k: string]: object;
}
const ABIs: TABI = {
  allPoolsLength: {
    "inputs": [],
    "name": "allPoolsLength",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  allPools: {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "name": "allPools",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        }
    ],
    "stateMutability": "view",
    "type": "function"
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
      chain: CHAIN.OPTIMISM,
      abi: ABIs.allPoolsLength,
    })).output;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: ABIs.allPools,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.OPTIMISM
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
          chain: CHAIN.OPTIMISM,
          permitFailure: true,
        })
      )
    );

    const tokens0 = underlyingToken0.output.map((res: any) => res.output);
    const tokens1 = underlyingToken1.output.map((res: any) => res.output);
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: topic_name,
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.OPTIMISM,
      topics: [topic0]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);
    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.OPTIMISM}:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
      const log: IAmount[] = logs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          BigNumber.config({ POW_PRECISION: 100 });
          const amount0 = new BigNumber('0x' + p.data.slice(0, 64)).toString();
          const amount1 = new BigNumber('0x' + p.data.slice(64, 128)).toString();
          return {
            amount0,
            amount1,
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`${CHAIN.OPTIMISM}:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.OPTIMISM}:${tokens1[index]}`]?.price || 0);
      const token0Decimals = (prices[`${CHAIN.OPTIMISM}:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.OPTIMISM}:${tokens1[index]}`]?.decimals || 0)
      const totalAmount0 = log
        .reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0) / 10 ** token0Decimals * token0Price;
      const totalAmount1 = log
        .reduce((a: number, b: IAmount) => Number(b.amount1) + Number(b.amount1) + a, 0) / 10 ** token1Decimals * token1Price;
      return (totalAmount0 + totalAmount1);
    });

    const dailyFees = untrackVolumes.reduce((a: number, b: number) => a + b, 0);
    return {
      dailyFees: `${dailyFees}`,
      timestamp,
    };
  } catch(error) {
    console.error(error);
    throw error;
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: async () => 1687305600,
    },
  }
};

export default adapter;
