import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import BigNumber from "bignumber.js";

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0In: number;
  amount1In: number;
  amount0Out: number;
  amount1Out: number;
}

const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
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


const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const poolLength = (await sdk.api2.abi.call({
      target: FACTORY_ADDRESS,
      chain: CHAIN.ARBITRUM,
      abi: ABIs.allPairsLength,
    }));

    const poolsRes = await sdk.api2.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.ARBITRUM
    });

    const lpTokens = poolsRes

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: CHAIN.ARBITRUM
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ARBITRUM,
      topics: [topic0]
    })))) as any;
    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.ARBITRUM}:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);

    const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[`${CHAIN.ARBITRUM}:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.ARBITRUM}:${tokens1[index]}`]?.decimals || 0)
      const log: IAmount[] = logs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          BigNumber.config({ POW_PRECISION: 100 });
          const amount0In = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
          const amount1In = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals;
          const amount0Out = Number('0x' + p.data.slice(128, 192)) / 10 ** token0Decimals;
          const amount1Out = Number('0x' + p.data.slice(192, 256)) / 10 ** token1Decimals;
          return {
            amount0In,
            amount1In,
            amount0Out,
            amount1Out,
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`${CHAIN.ARBITRUM}:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.ARBITRUM}:${tokens1[index]}`]?.price || 0);

      const totalAmount0 = log
        .reduce((a: number, b: IAmount) => Number(b.amount0In) + Number(b.amount0Out) + a, 0)  * token0Price;
      const totalAmount1 = log
        .reduce((a: number, b: IAmount) => Number(b.amount1In) + Number(b.amount1Out) + a, 0)  * token1Price;

      const untrackAmountUSD = token0Price !== 0 ? totalAmount0 : token1Price !== 0 ? totalAmount1 : 0; // counted only we have price data
      return untrackAmountUSD;
    });

    const dailyVolume = untrackVolumes.reduce((a: number, b: number) => a + b, 0);
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  } catch(error) {
    console.error(error);
    throw error;
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1678752000,
    },
  }
};

export default adapter;
