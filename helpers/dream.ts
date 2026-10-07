import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

// Overridable for local/staging runs against the api; production is the default so the adapters
// work out of the box with no env configured.
const DREAM_API_HOST = process.env.DREAM_API_HOST ?? "https://api.dos.app";

export interface DreamDailyStats {
  date: string;
  notionalUsd: string;
  notionalOpenUsd: string;
  notionalCloseUsd: string;
  // Split of notionalUsd by spot provenance, not an independent total. Verified rows carry a spot
  // from an executed quote, a stream frame, or an STS accepted-quote backfill; estimated rows
  // carry a CoinGecko approximation or a strike proxy (see notionalSource below for the per-row
  // counts behind this split).
  notionalVerifiedUsd: string;
  notionalEstimatedUsd: string;
  premiumUsd: string;
  premiumOpenUsd: string;
  premiumCloseUsd: string;
  feesUsd: string;
  referralSharedUsd: string;
  revenueUsd: string;
  openCount: number;
  closeCount: number;
  notionalSource: {
    quote: number;
    stream: number;
    backfillQuote: number;
    backfillApprox: number;
    strikeProxy: number;
  };
}

// Shared by fees/dreaming.ts and options/dream, which both read the same UTC-day stats off
// Dream's own public proxy route (dream-monorepo apps/api /public/defillama/daily), which in turn
// proxies the brokerage. `options.dateString` is already the UTC YYYY-MM-DD for `startOfDay`
// (see adapters/utils/runAdapter.ts), matching the proxy's `date` query param exactly.
export async function fetchDreamDailyStats(
  options: FetchOptions
): Promise<DreamDailyStats> {
  const url = `${DREAM_API_HOST}/public/defillama/daily?date=${options.dateString}`;
  return fetchURL(url);
}
