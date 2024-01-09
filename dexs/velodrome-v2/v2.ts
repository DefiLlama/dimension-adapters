import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
}

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
interface IAmount {
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
}
const topic_name = 'Swap(index_topic_1 address sender, index_topic_2 address to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)';
const topic0 = '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b';
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


export const fetchV2 = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
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
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      topic: topic_name,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.OPTIMISM,
      topics: [topic0]
    })))) as any;
    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.OPTIMISM}:${e}`);
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
          const amount0In = Number('0x' + p.data.slice(0, 64)).toString();
          const amount1In = Number('0x' + p.data.slice(64, 128)).toString();
          const amount0Out = Number('0x' + p.data.slice(128, 192)).toString();
          const amount1Out = Number('0x' + p.data.slice(192, 256)).toString();
          return {
            amount0In,
            amount1In,
            amount0Out,
            amount1Out,
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`${CHAIN.OPTIMISM}:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.OPTIMISM}:${tokens1[index]}`]?.price || 0);
      const token0Decimals = (prices[`${CHAIN.OPTIMISM}:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.OPTIMISM}:${tokens1[index]}`]?.decimals || 0)
      const totalAmount0 = log
        .reduce((a: number, b: IAmount) => Number(b.amount0In) + Number(b.amount0Out) + a, 0) / 10 ** token0Decimals * token0Price;
      const totalAmount1 = log
        .reduce((a: number, b: IAmount) => Number(b.amount1In) + Number(b.amount1Out) + a, 0) / 10 ** token1Decimals * token1Price;

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
