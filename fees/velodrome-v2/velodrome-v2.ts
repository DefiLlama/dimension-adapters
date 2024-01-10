import { FetchResultFees } from "../../adapters/types";
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
  amount0: string;
  amount1: string;
}

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
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


export const fetchV2 = async (fromBlock: number, toBlock: number, timestamp: number): Promise<FetchResultFees> => {
  try {
    const poolLength = (await sdk.api2.abi.call({
      target: FACTORY_ADDRESS,
      chain: CHAIN.OPTIMISM,
      abi: ABIs.allPoolsLength,
    }));

    const poolsRes = await sdk.api2.abi.multiCall({
      abi: ABIs.allPools,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.OPTIMISM
    });

    const lpTokens = poolsRes

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: CHAIN.OPTIMISM,
          permitFailure: true,
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      topic: topic_name,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.OPTIMISM,
      topics: [topic0]
    })))) as ILog[][];
    const rawCoins: string[] = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.OPTIMISM}:${e}`);
    const coins: string[] = [...new Set(rawCoins)]
    const coins_split: string[][] = [];
    for(let i = 0; i < coins.length; i+=100) {
      coins_split.push(coins.slice(i, i + 100))
    }
    const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
    const prices: TPrice = Object.assign({}, {});
    prices_result.map((a: any) => Object.assign(prices, a))
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
      dailyRevenue: `${dailyFees}`,
      dailyHoldersRevenue: `${dailyFees}`,
      timestamp,
    };
  } catch(error) {
    console.error(error);
    throw error;
  }
}
