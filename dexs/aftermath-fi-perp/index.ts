import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const CCXT_MARKETS_URL = "https://aftermath.finance/api/ccxt/markets";
const CCXT_OHLCV_URL = "https://aftermath.finance/api/ccxt/OHLCV";

const fetch = async (options: FetchOptions) => {
  const markets: any[] = await httpGet(CCXT_MARKETS_URL);

  const since = options.startOfDay * 1000;
  const candles = await Promise.all(
    markets.map((m: any) =>
      httpPost(CCXT_OHLCV_URL, { chId: m.id, timeframe: "1d", since, limit: 1 })
    )
  );

  let dailyVolume = 0;
  for (const marketCandles of candles) {
    if (Array.isArray(marketCandles) && marketCandles.length > 0) {
      dailyVolume += marketCandles[0][5] || 0; // [ts, o, h, l, c, volume]
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-02-18",
    },
  },
};

export default adapter;
