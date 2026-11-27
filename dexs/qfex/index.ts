import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const BASE_URL = "https://api.qfex.com";
const MINUTES_PER_DAY = 1440;
const DAILY_CANDLE_RESOLUTION = "1DAY";
const QFEX_API_CONCURRENCY = 2;
const QFEX_SYMBOL_THROTTLE_MS = 500;
const HISTORICAL_VOLUME_CUTOFF = "2026-07-27";
const HISTORICAL_VOLUME_THRESHOLD_USD = 10_000_000;
const HISTORICAL_VOLUME_DIVISOR = 10;

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

// use https://api.qfex.com/defillama/metrics?intervalMinutes=1440&fromISO=2026-07-07T11:50:25.000Z&toISO=2026-07-08T11:50:26.000Z 
// if rate the adapter gives wrong data or frequently rate limited
async function fetch(options: FetchOptions) {
  const fromISO = new Date(options.startTimestamp * 1000).toISOString();
  const toISO = new Date(options.endTimestamp * 1000).toISOString();

  const refdataRes = await fetchURL(`${BASE_URL}/refdata`);
  const symbols: string[] = (refdataRes.data ?? [])
    .filter((s: any) => s.status === "ACTIVE")
    .map((s: any) => s.symbol);

  // no need to handle errors as symbols active today may not be active yesterday
  const { results } = await PromisePool.withConcurrency(QFEX_API_CONCURRENCY).for(symbols).process(async (symbol) => {
    const encoded = encodeURIComponent(symbol);
    const [volRes, oiRes, candleRes] = await Promise.all([
      fetchURLAutoHandleRateLimit(`${BASE_URL}/taker-volume/${encoded}?intervalMinutes=${MINUTES_PER_DAY}&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as TakerVolumePoint[]),
      fetchURLAutoHandleRateLimit(`${BASE_URL}/open-interest/${encoded}?intervalMinutes=${MINUTES_PER_DAY}&fromISO=${fromISO}&toISO=${toISO}`)
        .then((r) => (r.data ?? []) as OIPoint[]),
      fetchURLAutoHandleRateLimit(`${BASE_URL}/candles/${encoded}?resolution=${DAILY_CANDLE_RESOLUTION}&fromISO=${fromISO}&toISO=${toISO}`)
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
        // QFEX open interest counts both sides of each contract, so halve it for one-sided OI.
        openInterestAtEndUSD = openInterest * closePrice / 2;
      }
    }

    await sleep(QFEX_SYMBOL_THROTTLE_MS);
    return { dailyVolumeUSD, openInterestAtEndUSD };
  });

  const reportedVolumeUSD = results.reduce((sum, result) => sum + result.dailyVolumeUSD, 0);
  // Estimate the historical reduction for dates when QFEX's feed included outsized stress-test volume.
  const applyHistoricalAdjustment = options.dateString < HISTORICAL_VOLUME_CUTOFF && reportedVolumeUSD > HISTORICAL_VOLUME_THRESHOLD_USD;
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(applyHistoricalAdjustment ? reportedVolumeUSD / HISTORICAL_VOLUME_DIVISOR : reportedVolumeUSD);

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(results.reduce((sum, result) => sum + result.openInterestAtEndUSD, 0));

  return {
    dailyVolume,
    openInterestAtEnd,
  };
}

const methodology = {
  Volume: "QFEX perpetual futures taker notional, with daily totals above $10 million divided by 10 before July 27, 2026 UTC as an estimate to account for historical stress-test volume.",
  OpenInterest: "Open interest is reported in contracts, and converted to USD using the matching QFEX candle close for the requested daily window and single-sided.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-02-26",
  methodology,
};

export default adapter;
