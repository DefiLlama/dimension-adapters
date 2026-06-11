import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const API_BASE = "https://api.ondoperps.xyz/v1";

const fetch = async (options: FetchOptions) => {
  const markets = (await fetchURL(`${API_BASE}/markets`)).result.perps.tradingPairs;

  // No error handling as current markets may not have historical candles.
  const { results } = await PromisePool.withConcurrency(3)
    .for(markets)
    .process(async ({ displayName }: any) => {
      const { t, c, v } = await fetchURLAutoHandleRateLimit(
        `${API_BASE}/perps/history?symbol=${encodeURIComponent(`${displayName}.P`)}&resolution=1D&from=${options.startOfDay}&to=${options.endTimestamp}`
      );
      const i = t.indexOf(options.startOfDay);
      return i >= 0 ? Number(c[i]) * Number(v[i]) : 0;
    });

  const dailyVolume = results.reduce((sum: number, volume: number) => sum + volume, 0);

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD trading volume on Ondo Perps.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-03-17", // First OHLCV Candle
  methodology,
};

export default adapter;
