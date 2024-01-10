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

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
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

const poolList = [
'0x77cfee25570b291b0882f68bac770abf512c2b5c',
'0x3c4beb9a8d83c888d28f3cef37e4fff662cae9d7',
'0x99b7daaf2468edcfbadd67df9bcea14d1a030675',
'0x3d6c56f6855b7cc746fb80848755b0a9c3770122',
'0x3d03ec9780298af6f7c23ec87fd9456d277f71a0',
'0xdc935ffe9f9c972b7b304e0b7e61eb774037e394',
'0x7547d05dff1da6b4a2ebb3f0833afe3c62abd9a1',
'0x58503d69ebfdf06095c2c9e122aa75ef80f89441',
'0x558dca97c224851cf428cbf244bec0b897642efc',
'0x0995f3932b4aca1ed18ee08d4b0dcf5f74b3c5d3',
'0x11a0779ea92176298b7a2760ae29fc9ce1ad47b4',
'0x1f19718e02114006f0d848f46b2437eb2db88c5d',
'0x767520fa98e1e24b3326fd42b24c9dcfce8bce14',
'0xffe9c27f0a12dabe5c5bd46d144a5c0140725566',
'0x853d0b5e504ae6f6cee8b5d89e9c1853c330e6e9'
]

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const lpTokens = poolList;

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: 'fantom',
          permitFailure: true
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = (await getBlock(fromTimestamp, 'fantom', {}));
    const toBlock = (await getBlock(toTimestamp, 'fantom', {}));
    const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: 'fantom',
      topics: [topic0]
    })))) as any;

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `fantom:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[`fantom:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`fantom:${tokens1[index]}`]?.decimals || 0)
      const log: IAmount[] = logs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          const amount0 = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
          const amount1 = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals
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
      start: async () => 1670544000,
    },
  }
};

export default adapter;
