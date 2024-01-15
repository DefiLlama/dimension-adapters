import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
}

const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const FACTORY_ADDRESS = '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd';

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
      chain: CHAIN.POLYGON,
      abi: ABIs.allPairsLength,
    }));

    const poolsRes = await sdk.api2.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.POLYGON,
      permitFailure: true,
    });

    const lpTokens = poolsRes

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: CHAIN.POLYGON,
          permitFailure: true,
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = await getBlock(fromTimestamp, CHAIN.POLYGON as Chain, {});
    const toBlock = await getBlock(toTimestamp, CHAIN.POLYGON as Chain, {});

    const logs: ILog[] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.POLYGON,
      topic: '',
      topics: [topic0]
    })))).flat();

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.POLYGON}:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const untrackVolumes: number[] = logs.map((e: ILog) => {
      const data =  e.data.replace('0x', '');
      const amount0In = Number('0x' + data.slice(0, 64));
      const amount1In = Number('0x' + data.slice(64, 128));
      const amount0Out = Number('0x' + data.slice(128, 192));
      const amount1Out = Number('0x' + data.slice(192, 256));

      const findIndex = lpTokens.findIndex((lp: string) => lp.toLowerCase() === e.address.toLowerCase())
      const token0Price = (prices[`${CHAIN.POLYGON}:${tokens0[findIndex]}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.POLYGON}:${tokens1[findIndex]}`]?.price || 0);
      const token0Decimals = (prices[`${CHAIN.POLYGON}:${tokens0[findIndex]}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.POLYGON}:${tokens1[findIndex]}`]?.decimals || 0)
      const amount0InUSD = (amount0In / 10 ** token0Decimals) * token0Price;
      const amount1InUSD = (amount1In / 10 ** token1Decimals) * token1Price;
      const amount0OutUSD = (amount0Out / 10 ** token0Decimals) * token0Price;
      const amount1OutUSD = (amount1Out / 10 ** token1Decimals) * token1Price;
      const amountUSD = token0Price !== 0 ? amount0InUSD + amount0OutUSD : token1Price !== 0 ? amount1InUSD + amount1OutUSD : 0; // counted only we have price data
      return amountUSD;
    });

    const dailyVolume = untrackVolumes
      .filter((e: number) => !isNaN(e))
      .reduce((a: number, b: number) => a + b, 0);
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
    [CHAIN.POLYGON]: {
      fetch,
      start: async () => 1686268800,
    },
  }
};

export default adapter;
