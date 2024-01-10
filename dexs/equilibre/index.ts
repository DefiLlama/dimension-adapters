import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { Chain } from "@defillama/sdk/build/general";

interface ILog {
  data: string;
  address: string;
  transactionHash: string;
}

const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const FACTORY_ADDRESS = '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95';

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
      chain: 'kava',
      abi: ABIs.allPairsLength,
    }));

    const poolsRes = await sdk.api2.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: 'kava',
      permitFailure: true
    });

    const lpTokens = poolsRes
      .filter((e: string)  => e.toLowerCase() !== '0xE6c4B59C291562Fa7D9FF5b39C38e2a28294ec49'.toLowerCase());

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: 'kava',
          permitFailure: true
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = await getBlock(fromTimestamp, 'kava' as Chain, {});
    const toBlock = await getBlock(toTimestamp, 'kava' as Chain, {});
    const _logs: ILog[] = [];
    const split_size: number = 55;
    for(let i = 0; i < lpTokens.length; i+=split_size) {
      const logs: ILog[] = (await Promise.all(lpTokens.slice(i, i + split_size).map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: 'kava',
        topics: [topic0]
      })))).flat();
      _logs.push(...logs)
    }
    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `kava:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const untrackVolumes = _logs.map((e: ILog) => {
      const data =  e.data.replace('0x', '');
      const amount0In = Number('0x' + data.slice(0, 64));
      const amount1In = Number('0x' + data.slice(64, 128));
      const amount0Out = Number('0x' + data.slice(128, 192));
      const amount1Out = Number('0x' + data.slice(192, 256));

      const findIndex = lpTokens.findIndex((lp: string) => lp.toLowerCase() === e.address.toLowerCase())
      const token0Price = (prices[`kava:${tokens0[findIndex]}`]?.price || 0);
      const token1Price = (prices[`kava:${tokens1[findIndex]}`]?.price || 0);
      const token0Decimals = (prices[`kava:${tokens0[findIndex]}`]?.decimals || 0)
      const token1Decimals = (prices[`kava:${tokens1[findIndex]}`]?.decimals || 0)
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
    [CHAIN.KAVA]: {
      fetch,
      start: async () => 1677888000,
    },
  }
};

export default adapter;
