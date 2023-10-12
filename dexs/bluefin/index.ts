import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import BigNumber from "bignumber.js";

const URL_CONFIG = {
  "arb": "https://dapi.api.arbitrum-prod.firefly.exchange/marketData",
  "sui": "https://dapi.api.sui-prod.bluefin.io/marketData",
}

const PRODUCT_CONFIG = {
  "arb": ["ETH-PERP", "BTC-PERP"],
  "sui": ["ETH-PERP", "BTC-PERP"],
}

interface Volume {
  totalVolume: string | undefined,
  dailyVolume: string | undefined,
  timestamp: number,     
}

const fetchURL = (baseURL: string, product: string): string => {
  return `${baseURL}?symbol=${product}`;
}

const computeVolume = async (timestamp: number, baseUrl: string, productIds: string[]): Promise<Volume> => {
  const dailyVolume = (await Promise.all(productIds.map((productId: string) => 
    axios.get(fetchURL(baseUrl, productId))
  )))
  .map((e: any) => (Number(e.data._24hrClosePrice) / 10 ** 18) * (Number(e.data._24hrVolume) / 10 ** 18))
  .reduce((volume: number, sum: number) => sum + volume, 0);

  return {
    totalVolume: undefined,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: timestamp,
  };
};

const fetchSUI = async (timeStamp: number) => {
  return await computeVolume(timeStamp, URL_CONFIG.sui, PRODUCT_CONFIG.sui);
};

const fetchArb = async (timeStamp: number) => {
  return await computeVolume(timeStamp, URL_CONFIG.arb, PRODUCT_CONFIG.arb);
};

const startTime = 1695600000; // 25th September when SUI trading starts

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchArb,
        start: async () => startTime,
      },
      [CHAIN.SUI]: {
        fetch: fetchSUI,
        start: async () => startTime,
      },
    },
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchArb,
        start: async () => startTime,
      },
      [CHAIN.SUI]: {
        fetch: fetchSUI,
        start: async () => startTime,
      },
    },
  },
};

export default adapter;
