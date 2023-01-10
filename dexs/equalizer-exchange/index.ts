import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";

interface IToken {
  address: string;
  decimale: number;
}

interface IPool {
  lpAddress: string;
  token0: IToken;
  token1: IToken;
}
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

const PAIR_TOKEN_ABI  = (token: string): object => {
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

interface IPairToken  {
  address: string;
  symbol: string;
  decimals: number;
}

interface IPairInfo {
  lpToken: string;
  pairName: string;
  token0: IPairToken;
  token1: IPairToken;
}

const getPairInfo = async (pair: string, tokenAddress: string[]): Promise<IPairInfo>  => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method: string) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'fantom',
      }
    )
  ));
  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.output.map(e => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: Number(tokenDecimals.output[0].output)
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: Number(tokenDecimals.output[1].output)
    }
  };
}

const fetch = async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const poolLength = await sdk.api.abi.call({
    target: FACTORY_ADDRESS,
    chain: 'fantom',
    abi: ABIs.allPairsLength,
  });

  const poolsRes = await sdk.api.abi.multiCall({
    abi: ABIs.allPairs,
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
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
  const pairInfos = await Promise.all(lpTokens.map((_, index: number) => getPairInfo(lpTokens[index], [tokens0[index], tokens1[index]])));
  const todaysBlock = (await getBlock(todaysTimestamp, 'fantom', {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, 'fantom', {}));
  const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: topic_name,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'fantom',
      topics: [topic0]
  }))))
    .map((p: any) => p)
    .map((a: any) => a.output);
  const coins = [...tokens0, ...tokens1].map((e: string) => `fantom:${e}`);
  const prices = await getPrices(coins, timestamp);
  const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
    const log: IAmount[] = logs[index]
    .map((e:ILog)  => {return  { ...e, data: e.data.replace('0x', '') }})
    .map((p: ILog) => {
      const amount0In = new BigNumber('0x'+p.data.slice(0, 64)).toString();
      const amount1In = new BigNumber('0x'+p.data.slice(64, 128)).toString();
      const amount0Out = new BigNumber('0x'+p.data.slice(128, 192)).toString();
      const amount1Out = new BigNumber('0x'+p.data.slice(192, 256)).toString();
      return {
        amount0In,
        amount1In,
        amount0Out,
        amount1Out,
      } as IAmount
    }) as IAmount [];
    const token0Price = (prices[`fantom:${tokens0[index].toLowerCase()}`]?.price || 0);
    const token1Price = (prices[`fantom:${tokens1[index].toLowerCase()}`]?.price || 0);
    const totalAmount0 = log
      .reduce((a: number, b: IAmount) => Number(b.amount0In)+ Number(b.amount0Out) + a, 0) / 10 ** pairInfos[index].token0.decimals * token0Price;
    const totalAmount1 = log
      .reduce((a: number, b: IAmount) => Number(b.amount1In)+ Number(b.amount1Out) + a, 0) / 10 ** pairInfos[index].token1.decimals * token1Price;
    const untrackAmountUSD = (totalAmount0 + totalAmount1) / 2;
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
      start: async () => 1600704000,
    },
  }
};

export default adapter;
