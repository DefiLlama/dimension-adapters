import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getDailyVolume } from "./volume";

// UTC-day rollup. Version 1: indexer cannot split a calendar day into hourly ranges.
/** Fetch the priced volume lower bound for the runner's UTC calendar day. */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = await getDailyVolume(options.startOfDay, options.dateString, httpGet);
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
      "Priced USD lower bound of UTC calendar-day swap volume, counted once per taker swap hop. Unpriced swaps are omitted; all-unpriced days remain missing. Excludes columbus-5 gem pairs, wrap/unwrap, UST1 window, and limit_order_fills.",
  },
};

export default adapter;
