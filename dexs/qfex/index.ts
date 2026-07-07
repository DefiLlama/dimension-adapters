import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const BASE_URL = "https://api.qfex.com";
// QFEX historical endpoints aggregate by minute interval; DefiLlama pulls this v2 adapter hourly and daily.
const MINUTES_PER_DAY = 1440;
const DAILY_CANDLE_RESOLUTION = "1DAY";
const HOURLY_CANDLE_RESOLUTION = "1HOUR";
const QFEX_API_CONCURRENCY = 2;
// Keep a small per-worker delay between symbol requests to avoid bursting the QFEX public API.
const QFEX_SYMBOL_THROTTLE_MS = 500;

interface TakerVolumePoint {
  takerBuyNotional: number;
  takerSellNotional: number;
}

interface OIPoint {
  windowStart: string;
  openInterest: number | null;
}

interface CandlePoint {
  startedAt: string;
  close: string;
}

async function fetch(options: FetchOptions) {
  const fromISO = new Date(options.startTimestamp * 1000).toISOString();
  const toISO = new Date(options.endTimestamp * 1000).toISOString();
  const intervalMinutes = Math.max(1, Math.round((options.endTimestamp - options.startTimestamp) / 60));
  const candleResolution = intervalMinutes >= MINUTES_PER_DAY ? DAILY_CANDLE_RESOLUTION : HOURLY_CANDLE_RESOLUTION;

  const refdataRes = await fetchURL(`${BASE_URL}/refdata`);
  const symbols: string[] = (refdataRes.data ?? [])
    .filter((s: any) => s.status === "ACTIVE")
    .map((s: any) => s.symbol);

  const { results, errors } = await PromisePool.withConcurrency(QFEX_API_CONCURRENCY).for(symbols).process(async (symbol) => {
    const encoded = encodeURIComponent(symbol);
    const [volRes, oiRes, candleRes] = await Promise.all([
      fetchURLAutoHandleRateLimit(`${BASE_URL}/taker-volume/${encoded}?intervalMinutes=${intervalMinutes}&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as TakerVolumePoint[]),
      fetchURLAutoHandleRateLimit(`${BASE_URL}/open-interest/${encoded}?intervalMinutes=${intervalMinutes}&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as OIPoint[]),
      fetchURLAutoHandleRateLimit(`${BASE_URL}/candles/${encoded}?resolution=${candleResolution}&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.candles ?? []) as CandlePoint[]),
    ]);

    const dailyVolumeUSD = volRes.reduce((sum, p) => sum + (p.takerBuyNotional ?? 0) + (p.takerSellNotional ?? 0), 0);
    let openInterestAtEndUSD = 0;

    if (oiRes.length > 0) {
      const last = oiRes[oiRes.length - 1];
      const closePrice = Number(candleRes.find((c) => c.startedAt === last.windowStart)?.close);
      const openInterest = Number(last.openInterest);
      if (Number.isFinite(openInterest)) {
        if (!Number.isFinite(closePrice)) throw new Error(`Missing close price for ${symbol}`);
        openInterestAtEndUSD = openInterest * closePrice;
      }
    }

    await sleep(QFEX_SYMBOL_THROTTLE_MS);
    return { dailyVolumeUSD, openInterestAtEndUSD };
  });

  if (errors.length > 0) throw errors[0];

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(results.reduce((sum, result) => sum + result.dailyVolumeUSD, 0));

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(results.reduce((sum, result) => sum + result.openInterestAtEndUSD, 0));

  return {
    dailyVolume,
    openInterestAtEnd,
  };
}

const methodology = {
  Volume: "Taker notional volume across all perpetual futures markets on QFEX (buy-side + sell-side taker notional, no double-counting of maker volume).",
  OpenInterest: "Open interest is reported in contracts and converted to USD using the matching QFEX candle close for the requested hourly or daily window.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-02-26",
  pullHourly: true,
  methodology,
};

export default adapter;
