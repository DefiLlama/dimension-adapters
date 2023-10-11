import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import BigNumber from "bignumber.js";

const url_config = {
  "arb": "https://dapi.api.arbitrum-prod.firefly.exchange/candlestickData",
  "sui": "https://dapi.api.sui-prod.bluefin.io/candlestickData",
}

const product_config = {
  "arb": ["ETH-PERP", "BTC-PERP"],
  "sui": ["ETH-PERP", "BTC-PERP"],
}

const fetchURL = (baseURL: string, product: string, toTimestamp: number, fromTimestamp: number, limit: number, ) => {
  baseURL = `${baseURL}` + `?symbol=${product}`;
  baseURL = `${baseURL}` + `&interval=3m`;
  baseURL = `${baseURL}` + `&startTime=${fromTimestamp}`;
  baseURL = `${baseURL}` + `&endTime=${toTimestamp}`;
  baseURL = `${baseURL}` + `&limit=${limit}`;
  return baseURL;
}

const computeVolume = async (timestamp: number, baseUrl: string, productIds: string[]) => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const GRANULARITY = 180; // 3m
  const LIMIT = 86400 / GRANULARITY; // MAX exchange limit is 500.

  const dailyVolume = (await Promise.all(productIds.map((productId: string) => 
    axios.get(fetchURL(baseUrl, productId, toTimestamp * 1000, fromTimestamp * 1000, LIMIT))
  )))
  .map((e: any) => e.data)
  .flat()
  .map((e: any[]) => (Number(e[5]) / 10 ** 18) * (Number(e[4]) / 10 ** 18))
  .reduce((volume: number, sum: number) => sum + volume, 0);

  return {
    totalVolume: undefined,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};

const fetchSUI = async (timeStamp: number) => {
  return await computeVolume(timeStamp, url_config.sui, product_config.sui);
};

const fetchArb = async (timeStamp: number) => {
  return await computeVolume(timeStamp, url_config.arb, product_config.arb);
};

const startTime = 1695857191;

const adapter: BreakdownAdapter = {
  breakdown: {
    sui: {
      [CHAIN.SUI]: {
        fetch: fetchSUI,
        start: async () => startTime,
      },
    },
    arb: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchArb,
        start: async () => startTime,
      },
    },
  },
};

export default adapter;
