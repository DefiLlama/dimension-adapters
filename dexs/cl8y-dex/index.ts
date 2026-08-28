import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// UTC-day rollup. Version 1: indexer cannot split a calendar day into hourly ranges.
const INDEXER_DAILY = "https://indexer.dex.cl8y.com/api/v1/defillama/daily";

function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (value === "0") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`${INDEXER_DAILY}?timestamp=${options.startOfDay}`);
  const dailyVolume = asNumberOrNull(data?.volume_usd);
  if (dailyVolume == null) {
    throw new Error(`cl8y-dex dailyVolume unpriced or missing for ${options.startOfDay}`);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TERRA],
  // First UTC day GET /api/v1/defillama/daily returns 200. Earlier days 404.
  start: "2026-08-17",
  methodology: {
    Volume:
      "UTC calendar-day SUM(swap_events.volume_usd) once per taker swap. Excludes columbus-5 gem pairs, wrap/unwrap, UST1 window, and limit_order_fills.",
  },
};

export default adapter;
