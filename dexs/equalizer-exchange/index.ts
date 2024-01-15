import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import BigNumber from "bignumber.js";
import { IYield, getTopPool } from "../../helpers/pool";

interface ILog {
  data: string;
  transactionHash: string;
  address: string;
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
type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
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

process.env.FANTOM_BATCH_MAX_COUNT = "10";

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const poolData: IYield[] = (await getTopPool('equalizer-exchange', CHAIN.FANTOM))
    const pools = poolData.map((a: IYield) => a.pool_old)
    const lpTokens = pools
    const underlyingToken = poolData.map((pol: IYield) => {
      return {
        underlyingToken0: pol.underlyingTokens[0],
        underlyingToken1: pol.underlyingTokens[1]
      }
    });

    const tokens0 = underlyingToken.map((a: any) => a.underlyingToken0);
    const tokens1 = underlyingToken.map((a: any) => a.underlyingToken1);
    const fromBlock = (await getBlock(fromTimestamp, 'fantom', {}));
    const toBlock = (await getBlock(toTimestamp, 'fantom', {}));
    const logs: ILog[] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: 'fantom',
      topics: [topic0],
    })))).flat();
    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `fantom:${e}`);
    const coins: string[] = [...new Set(rawCoins)];
    const coins_split: string[][] = [];
    for (let i = 0; i < coins.length; i += 100) {
      coins_split.push(coins.slice(i, i + 100));
    }
    const prices_result: any = (await Promise.all(coins_split.map((a: string[]) => getPrices(a, timestamp)))).flat().flat().flat();
    const prices: TPrice = Object.assign({}, {});
    prices_result.map((a: any) => Object.assign(prices, a))
    const untrackVolumes: number[] = logs.map((e: ILog) => {
      const data =  e.data.replace('0x', '');
      const amount0In = Number('0x' + data.slice(0, 64));
      const amount1In = Number('0x' + data.slice(64, 128));
      const amount0Out = Number('0x' + data.slice(128, 192));
      const amount1Out = Number('0x' + data.slice(192, 256));

      const findIndex = lpTokens.findIndex((lp: string) => lp.toLowerCase() === e.address.toLowerCase())
      const token0Price = (prices[`${CHAIN.FANTOM}:${tokens0[findIndex]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.FANTOM}:${tokens1[findIndex]}`]?.price || 0);
      const token0Decimals = (prices[`${CHAIN.FANTOM}:${tokens0[findIndex]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.FANTOM}:${tokens1[findIndex]}`]?.decimals || 0)
      const totalAmount0 = ((amount0In + amount0Out) / 10 ** token0Decimals) * token0Price;
      const totalAmount1 = ((amount1In + amount1Out) / 10 ** token1Decimals) * token1Price;
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
    [CHAIN.FANTOM]: {
      fetch,
      start: async () => 1670544000,
    },
  }
};

export default adapter;
