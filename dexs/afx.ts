import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AFX_START, fetchAfxDailyStats, usd } from "../helpers/afx";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchAfxDailyStats(options);

  return {
    dailyVolume: usd(stats?.dailyVolumeUsd),
  };
};

const methodology = {
  Volume: "Single-sided AFX perpetual trading volume in USD, including taker-side, maker-side, and liquidation-related fills executed on AFX.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: AFX_START,
  methodology,
};

export default adapter;
