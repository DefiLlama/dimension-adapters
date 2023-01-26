import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import BigNumber from "bignumber.js";
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
const topic_name = 'Swap(index_topic_1 address sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, index_topic_2 address to)';
const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const FACTORY_ADDRESS = '0xc6366efd0af1d09171fe0ebf32c7943bb310832a';

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

  const poolLength = (await sdk.api.abi.call({
    target: FACTORY_ADDRESS,
    chain: 'fantom',
    abi: ABIs.allPairsLength,
  })).output;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: ABIs.allPairs,
    calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
      target: FACTORY_ADDRESS,
      params: i,
    })),
    chain: 'fantom'
  });

  const lpTokens = poolsRes.output
    .map(({ output }) => output);

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
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
    topic: topic_name,
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
  const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
    const log: IAmount[] = logs[index]
      .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
      .map((p: ILog) => {
        const amount0In = new BigNumber('0x' + p.data.slice(0, 64)).toString();
        const amount1In = new BigNumber('0x' + p.data.slice(64, 128)).toString();
        const amount0Out = new BigNumber('0x' + p.data.slice(128, 192)).toString();
        const amount1Out = new BigNumber('0x' + p.data.slice(192, 256)).toString();
        return {
          amount0In,
          amount1In,
          amount0Out,
          amount1Out,
        } as IAmount
      }) as IAmount[];
    const token0Price = (prices[`fantom:${tokens0[index].toLowerCase()}`]?.price || 0);
    const token1Price = (prices[`fantom:${tokens1[index].toLowerCase()}`]?.price || 0);
    const token0Decimals = (prices[`fantom:${tokens0[index].toLowerCase()}`]?.decimals || 0)
    const token1Decimals = (prices[`fantom:${tokens1[index].toLowerCase()}`]?.decimals || 0)
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
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: async () => 1670544000,
    },
  }
};

export default adapter;
