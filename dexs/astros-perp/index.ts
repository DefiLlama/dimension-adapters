import {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";

const BASE_URL = "https://llama.astros.ag/api/third/info";

const methodology = {
  Volume: "Volume of all perpetual contract trades executed",
};

const getHeaders = () => ({
  "api-key": getEnv("ASTROS_PERP_API_KEY"),
});

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const [pairs, oi] = await Promise.all([
    httpGet(`${BASE_URL}/pairs`, { headers: getHeaders() }),
    httpGet(`${BASE_URL}/oi`, { headers: getHeaders() }),
  ]);

  const tradablePairs = pairs.data.filter((pair: any) => pair.tradable);

  const volumes = await Promise.all(
    tradablePairs.map(async (pair: any) => {
      const ticker: any = await httpGet(
        `${BASE_URL}/ticker/24hr?pairName=${pair.symbol}`,
        { headers: getHeaders() }
      );
      return Number(ticker.data.amount);
    })
  );

  const dailyVolume = volumes.reduce((sum, v) => sum + v, 0);
  const openInterestAtEnd = oi.data.reduce(
    (sum: number, item: any) => sum + Number(item.amount),
    0
  );

  return {
    dailyVolume,
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-10-24",
    },
  },
};

export default adapter;
