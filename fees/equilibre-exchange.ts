import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import fetchURL from "../utils/fetchURL";

interface ILog {
  data: string;
  transactionHash: string;
  address: string;
}

const topic0 = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';

interface IYield {
  project: string;
  chain: string;
  pool_old: string;
  underlyingTokens: string[];
};

const yieldPool = "https://yields.llama.fi/poolsOld";

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  try {
    // use top pools from yield.llama
    const poolsCall: IYield[] = (await fetchURL(yieldPool))?.data.data;
    const poolsData: IYield[] = poolsCall
      .filter((e: IYield) => e.project === "equilibre")
      .filter((e: IYield) => e.chain.toLowerCase() === CHAIN.KAVA)

    const pools = poolsData.map((e: IYield) => e.pool_old);
    const lpTokens = pools
    const underlyingToken = poolsData.map((e: IYield) => {
      return {
        underlyingToken0: e.underlyingTokens[0],
        underlyingToken1: e.underlyingTokens[1],
      }
    });

    const tokens0 = underlyingToken.map((e: any) => e.underlyingToken0);
    const tokens1 = underlyingToken.map((e: any) => e.underlyingToken1);
    const fromBlock = (await getBlock(fromTimestamp, 'kava', {}));
    const toBlock = (await getBlock(toTimestamp, 'kava', {}));
    const logs: ILog[] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      topic: '',
      chain: 'kava',
      topics: [topic0]
    })))).flat();

    const rawCoins = [...tokens0, ...tokens1].map((e: string) => `kava:${e}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = logs.map((e: ILog) => {
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
