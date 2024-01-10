import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
  address: string;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
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


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
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
          chain: 'kava',
          permitFailure: true,
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = (await getBlock(fromTimestamp, 'kava', {}));
    const toBlock = (await getBlock(toTimestamp, 'kava', {}));

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
    const fees: number[] = _logs.map((e: ILog) => {
      const data =  e.data.replace('0x', '');
      const findIndex = lpTokens.findIndex((lp: string) => lp.toLowerCase() === e.address.toLowerCase())
      const token0Price = (prices[`kava:${tokens0[findIndex]}`]?.price || 0);
      const token1Price = (prices[`kava:${tokens1[findIndex]}`]?.price || 0);
      const token0Decimals = (prices[`kava:${tokens0[findIndex]}`]?.decimals || 0)
      const token1Decimals = (prices[`kava:${tokens1[findIndex]}`]?.decimals || 0)
      const feesAmount0 = (Number('0x' + data.slice(0, 64)) / 10 ** token0Decimals) * token0Price;
      const feesAmount1 = (Number('0x' + data.slice(64, 128)) / 10 ** token1Decimals) * token1Price;
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
    [CHAIN.KAVA]: {
      fetch,
      start: async () => 1677888000,
    },
  }
};

export default adapter;
