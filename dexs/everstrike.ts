import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://api.everstrike.io";
// Local fail-fast limit; the API documents request-rate limits but no timeout.
const REQUEST_TIMEOUT_MS = 10000;
// Local cap on in-flight requests; starts are paced to the documented API rate below.
const API_CONCURRENCY = 8;
// Everstrike REST docs specify 20 requests/second (50ms); add 5ms of headroom:
// https://registry.scalar.com/@default-team-2onip/apis/everstrike-rest-api/latest
const API_REQUEST_INTERVAL_MS = 55;
const OHLCV_INTERVAL = "24h";
// One 24-hour candle is expected for each UTC daily window.
const OHLCV_LIMIT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_SECONDS = DAY_MS / 1000;

interface Pair {
  category?: string;
}

interface PairsResponse {
  code: number;
  result: Record<string, Pair>;
}

interface OhlcvCandle {
  close_time?: number | string;
  base_volume?: number | string;
}

interface OhlcvResponse {
  code: number;
  msg?: string | null;
  result: OhlcvCandle[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isUnlistedPerpetualFuture = (market: string) =>
  market.endsWith("_PERP") && !/(?:CALL|PUT)\d*_PERP$|AVG_PERP$/.test(market);

const getMarkets = (payload: unknown, pairs: Record<string, Pair>): string[] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Everstrike ticker returned an invalid payload");
  }

  const markets = Object.entries(payload as Record<string, unknown>).filter(([market]) => {
    const pair = pairs[market];
    if (pair) return pair.category === "future";

    // /ticker retains removed futures; keep plain *_PERP keys, but exclude options and
    // AVG products whose historical category is unavailable from /pairs.
    return isUnlistedPerpetualFuture(market);
  });
  if (markets.length === 0) throw new Error("Everstrike ticker returned no perpetual futures");

  for (const [market, ticker] of markets) {
    if (!ticker || typeof ticker !== "object" || Array.isArray(ticker)) {
      throw new Error(`Everstrike ticker returned an invalid row for ${market}`);
    }
  }

  return markets.map(([market]) => market);
};

const getDailyVolume = (candles: OhlcvCandle[], endMs: number) => {
  if (!Array.isArray(candles)) throw new Error("Everstrike OHLCV returned an invalid result");
  if (candles.length !== 1) {
    throw new Error(`Everstrike OHLCV returned ${candles.length} candles for one daily window`);
  }

  const candle = candles[0];
  if (!candle || typeof candle !== "object" || Array.isArray(candle)) {
    throw new Error("Everstrike OHLCV returned an invalid candle");
  }

  // Everstrike's daily open_time differs by market type; close_time is the UTC day boundary.
  // Markets without a candle's trading data are returned as an empty object and count as zero.
  if (Object.keys(candle).length === 0) return 0;
  const closeTime = Number(candle.close_time);
  if (!Number.isFinite(closeTime) || closeTime !== endMs) {
    throw new Error(`Everstrike OHLCV returned an unexpected daily candle time=${candle.close_time}`);
  }

  const rawVolume = candle.base_volume;
  if (typeof rawVolume !== "number" && typeof rawVolume !== "string") {
    throw new Error("Everstrike OHLCV candle is missing base_volume");
  }
  if (typeof rawVolume === "string" && rawVolume.trim() === "") {
    throw new Error("Everstrike OHLCV candle has empty base_volume");
  }

  const volume = Number(rawVolume);
  if (!Number.isFinite(volume) || volume < 0) {
    throw new Error(`Everstrike OHLCV returned invalid base_volume=${rawVolume}`);
  }

  return volume;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  let startTimestamp = options.startTimestamp;
  // Dimension's daily window includes an extra second before UTC midnight.
  if (options.endTimestamp - startTimestamp === DAY_SECONDS + 1) startTimestamp += 1;

  const startMs = startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    endMs - startMs !== DAY_MS ||
    startMs % DAY_MS !== 0
  ) {
    throw new Error("Everstrike expects a UTC daily time window");
  }

  const pairs = (await httpGet(`${API_BASE}/pairs`, { timeout: REQUEST_TIMEOUT_MS })) as PairsResponse;
  if (pairs?.code !== 200 || !pairs.result || typeof pairs.result !== "object" || Array.isArray(pairs.result)) {
    throw new Error("Everstrike pairs API returned an invalid response");
  }

  const ticker = await httpGet(`${API_BASE}/ticker`, { timeout: REQUEST_TIMEOUT_MS });
  const markets = getMarkets(ticker, pairs.result);

  // The API documents a 20 request/second limit; space starts slightly beyond 50ms.
  let nextRequestAt = 0;
  const { results, errors } = await PromisePool.withConcurrency(API_CONCURRENCY)
    .for(markets)
    .process(async (market: string) => {
      const requestAt = Math.max(Date.now(), nextRequestAt);
      nextRequestAt = requestAt + API_REQUEST_INTERVAL_MS;
      await sleep(Math.max(0, requestAt - Date.now()));

      try {
        const query = new URLSearchParams({
          pair: market,
          start: String(startMs),
          // Keep the inclusive API end inside Dimension's [startMs, endMs) daily window.
          end: String(endMs - 1),
          interval: OHLCV_INTERVAL,
          limit: String(OHLCV_LIMIT),
        });
        const response = (await httpGet(`${API_BASE}/ohlcv?${query}`, {
          timeout: REQUEST_TIMEOUT_MS,
        })) as OhlcvResponse;

        if (!response || response.code !== 200 || !Array.isArray(response.result)) {
          throw new Error(response?.msg || `unexpected response code ${response?.code}`);
        }

        return getDailyVolume(response.result, endMs);
      } catch (error) {
        throw new Error(`Everstrike OHLCV failed for ${market}: ${String(error)}`);
      }
    });

  if (errors.length) {
    throw new Error(`Everstrike OHLCV failed for ${errors.length}/${markets.length} markets: ${errors[0].message}`);
  }

  return { dailyVolume: results.reduce((sum, volume) => sum + volume, 0) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  // The API only exposes 24-hour candles, so fetch fixed UTC daily windows.
  // All 332 market keys return a daily row from this date; 2025-02-01 returned no BTC row.
  start: "2025-03-01",
  methodology: {
    Volume:
      "Sum of USD-denominated base_volume from Everstrike's 24-hour OHLCV candles across all markets (https://api.everstrike.io/ohlcv).",
  },
};

export default adapter;
