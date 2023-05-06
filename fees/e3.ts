import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0: number;
  amount1: number;
}

// Unique to EⅢ DEX
const topic0 = '0xad7d6f97abf51ce18e17a38f4d70e975be9c0708474987bb3e26ad21bd93ca70';
const FACTORY_ADDRESS = '0x8597db3ba8de6baadeda8cba4dac653e24a0e57b';

type TABI = {
  [k: string]: object;
}

// Unique to EⅢ DEX
const ABIs: TABI = {
  getNumberOfLBPairs: {
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
  getLBPairAtIndex: {
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

// Common Template: String(_token) -> Object(returnObject)
const PAIR_TOKEN_ABI = (_token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": _token,
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
      chain: 'fantom',
      abi: ABIs.getNumberOfLBPairs,
    })).output;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: ABIs.getLBPairAtIndex,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: 'fantom'
    });

    const lpTokens = poolsRes.output
      .map(({ output }) => output);

    // Templated Call "PAIR_TOKEN_ABI" with method unique to EⅢ DEX
    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['getTokenX', 'getTokenY'].map((method) =>
        sdk.api.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address) => ({
            target: address,
          })),
          chain: 'fantom'
        })
      )
    );

    const tokens0 = underlyingToken0.output.map((res) => res.output);
    const tokens1 = underlyingToken1.output.map((res) => res.output);
    const fromBlock = (await getBlock(fromTimestamp, 'fantom', {}));
    const toBlock = (await getBlock(toTimestamp, 'fantom', {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: 'fantom',
      topics: [topic0]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `fantom:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[`fantom:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`fantom:${tokens1[index]}`]?.decimals || 0)
      const log: IAmount[] = logs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          const amount0 = Number('0x' + p.data.slice(64*4+32*0, 64*4+32*0+32)) / 10 ** token0Decimals;
          const amount1 = Number('0x' + p.data.slice(64*4+32*1, 64*4+32*1+32)) / 10 ** token1Decimals
          return {
            amount0,
            amount1
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`fantom:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`fantom:${tokens1[index]}`]?.price || 0);

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
      fetch,
      start: async () => 1681123392,
    },
  }
};

export default adapter;
