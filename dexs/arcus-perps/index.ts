import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const API_BASE = "https://api.arcus.xyz/v1";

const fetch = async (options: FetchOptions) => {
  // Arcus candle timestamps are Unix microseconds.
  const start = options.startOfDay * 1e6;
  const end = (options.startOfDay + 86400) * 1e6;
  const { markets } = await fetchURL(`${API_BASE}/markets`);
  const perpMarkets: string[] = markets
    .filter((market: any) => market.type === "PERPETUAL")
    .map((market: any) => market.marketDisplayName);

  const { results } = await PromisePool.withConcurrency(3)
    .for(perpMarkets)
    .process(async (market: string) => {
      const url = new URL(`${API_BASE}/candles`);
      url.searchParams.set("market", market);
      url.searchParams.set("timeframe", "1d");
      url.searchParams.set("from", `${start}`);
      url.searchParams.set("to", `${end}`);

      const { candles = [] } = await fetchURLAutoHandleRateLimit(url.toString());

      return candles.reduce((sum: number, candle: any) => {
        const openTime = Number(candle.openTime);
        if (!candle.isFinal || openTime < start || openTime >= end) return sum;
        return sum + Number(candle.notionalVolume);
      }, 0);
    });

  const dailyVolume = results.reduce((sum: number, volume: number) => sum + volume, 0);

  return { dailyVolume };
};

const methodology = {
  Volume: "Total daily trading volume from all perpetual markets on Arcus.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-01",
  methodology,
};

export default adapter;
