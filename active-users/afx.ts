import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AFX_START, fetchAfxDailyStats } from "../helpers/afx";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchAfxDailyStats(options);

  return {
    // activeOrderUsers is the daily distinct users with new_order_count > 0.
    dailyActiveUsers: stats?.activeOrderUsers ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: AFX_START,
};

export default adapter;
