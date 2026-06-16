import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AFX_START, fetchAfxDailyStats, usd } from "../helpers/afx";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchAfxDailyStats(options);

  return {
    openInterestAtEnd: usd(stats?.openInterestUsd),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: AFX_START,
};

export default adapter;
