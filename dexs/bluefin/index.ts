import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const URL_CONFIG = {
  "sui": "https://dapi.api.sui-prod.bluefin.io/marketData",
}

const PRODUCT_CONFIG = {
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
    httpGet(fetchURL(baseUrl, productId))
  )))
  .map((e: any) => (Number(e._24hrClosePrice) / 10 ** 18) * (Number(e._24hrVolume) / 10 ** 18))
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

const startTime = 1695600000; // 25th September when SUI trading starts

const adapter: BreakdownAdapter = {
  breakdown: {
    derivatives: {
      [CHAIN.SUI]: {
        fetch: fetchSUI,
        start: startTime,
        runAtCurrTime: true
      },
    },
  },
};

export default adapter;
