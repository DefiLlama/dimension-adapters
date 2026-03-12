import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const CCXT_MARKETS_URL = "https://aftermath.finance/api/ccxt/markets";
const CCXT_OHLCV_URL = "https://aftermath.finance/api/ccxt/OHLCV";

const fetch = async (_: any, __: any, options: FetchOptions) => {
  const markets: any[] = await httpGet(CCXT_MARKETS_URL);
  let dailyVolume = 0;

  const since = options.startOfDay * 1000;
  await PromisePool.withConcurrency(3).for(
    markets)
    .process(async (m: any) => {
      const candles = await httpPost(CCXT_OHLCV_URL, { chId: m.id, timeframe: "1d", since, limit: 1 });
      if (Array.isArray(candles) && candles.length > 0) {
        dailyVolume += candles[0][5] || 0; // [ts, o, h, l, c, volume]
      }
      return candles;
    });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-02-18",
    },
  },
};

export default adapter;
