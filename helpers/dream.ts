import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

export interface DreamDailyStats {
  date: string;
  notionalUsd: string;
  notionalOpenUsd: string;
  notionalCloseUsd: string;
  notionalVerifiedUsd: string; // rows priced from an executed or accepted STS quote
  notionalEstimatedUsd: string; // rows priced from a CoinGecko spot or strike proxy
  premiumUsd: string;
  premiumOpenUsd: string;
  premiumCloseUsd: string;
  feesUsd: string;
  referralSharedUsd: string;
  revenueUsd: string;
  openCount: number;
  closeCount: number;
}

// Dream's public daily stats for fees/dreaming and options/dreaming, one finished UTC day per call
export async function fetchDreamDailyStats(options: FetchOptions): Promise<DreamDailyStats> {
  return fetchURL(`https://api.dos.app/public/defillama/daily?date=${options.dateString}`);
}
