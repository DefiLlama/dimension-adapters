import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
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
