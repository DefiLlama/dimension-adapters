import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import BigNumber from "bignumber.js";

const url_config = {
  "arb": "https://dapi.api.arbitrum-prod.firefly.exchange/marketData",
  "sui": "https://dapi.api.sui-prod.bluefin.io/marketData",
}

const product_config = {
  "arb": ["ETH-PERP", "BTC-PERP"],
  "sui": ["ETH-PERP", "BTC-PERP"],
}

interface Volume {
  totalVolume: string | undefined,
  dailyVolume: string | undefined,
  timestamp: number,     
}

const fetchURL = (baseURL: string, product: string) => {
  baseURL = `${baseURL}` + `?symbol=${product}`;
  return baseURL;
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
