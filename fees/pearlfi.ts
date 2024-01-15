import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { getTopPool } from "../helpers/pool";

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
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


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
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

    const lpTokens = poolsRes;

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
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}));
    const logs: ILog[] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      topic: '',
      fromBlock: fromBlock,
      chain: CHAIN.POLYGON,
      topics: [topic0]
    })))).flat()

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.POLYGON}:${e.toLowerCase()}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const dailyFees: number = logs.map((e: ILog) => {
      const data =  e.data.replace('0x', '');
      const findIndex = lpTokens.findIndex((lp: string) => lp.toLowerCase() === e.address.toLowerCase())
      const token0Price = (prices[`${CHAIN.POLYGON}:${tokens0[findIndex].toLowerCase()}`]?.price || 0);
      const token1Price = (prices[`${CHAIN.POLYGON}:${tokens1[findIndex].toLowerCase()}`]?.price || 0);
      const token0Decimals = (prices[`${CHAIN.POLYGON}:${tokens0[findIndex].toLowerCase()}`]?.decimals || 0)
      const token1Decimals = (prices[`${CHAIN.POLYGON}:${tokens1[findIndex].toLowerCase()}`]?.decimals || 0)
      const feesAmount0 = (Number('0x' + data.slice(0, 64)) / 10 ** token0Decimals) * token0Price;
      const feesAmount1 = (Number('0x' + data.slice(64, 128)) / 10 ** token1Decimals) * token1Price;
      const feesUSD = feesAmount0 + feesAmount1;
      return feesUSD;
    }).reduce((a: number, b: number) => a + b, 0);

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
    [CHAIN.POLYGON]: {
      fetch,
      start: async () => 1686268800,
    },
  }
};

export default adapter;
