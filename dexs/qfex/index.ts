import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://api.qfex.com";

interface DefillamaMetricsPoint {
  windowStart: string;
  dailyVolumeUSD: number;
  openInterestAtEndUSD: number;
}

async function fetch(options: FetchOptions) {
  const fromISO = new Date(options.startTimestamp * 1000).toISOString();
  const toISO = new Date(options.endTimestamp * 1000).toISOString();
  const intervalMinutes = Math.max(1, Math.round((options.endTimestamp - options.startTimestamp) / 60));
  const windowStart = new Date(options.startTimestamp * 1000).toISOString().replace(".000Z", "Z");

  const res = await fetchURL(
    `${BASE_URL}/defillama/metrics?intervalMinutes=${intervalMinutes}&fromISO=${fromISO}&toISO=${toISO}`,
  );
  const points = (res.data ?? []) as DefillamaMetricsPoint[];
  const point = points.find((p) => p.windowStart === windowStart) ?? points[points.length - 1];

  if (!point) throw new Error(`Missing QFEX DefiLlama metrics for ${windowStart}`);

  const dailyVolumeUSD = Number(point.dailyVolumeUSD);
  const openInterestAtEndUSD = Number(point.openInterestAtEndUSD);
  if (!Number.isFinite(dailyVolumeUSD)) throw new Error(`Invalid QFEX dailyVolumeUSD for ${windowStart}`);
  if (!Number.isFinite(openInterestAtEndUSD)) throw new Error(`Invalid QFEX openInterestAtEndUSD for ${windowStart}`);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(dailyVolumeUSD);

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(openInterestAtEndUSD);

  return {
    dailyVolume,
    openInterestAtEnd,
  };
}

const methodology = {
  Volume: "Taker notional volume across all perpetual futures markets on QFEX (buy-side + sell-side taker notional, no double-counting of maker volume).",
  OpenInterest: "Open interest is converted from contracts to USD using the matching QFEX window price.",
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
