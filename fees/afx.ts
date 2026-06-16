import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AFX_START, fetchAfxDailyStats, usd } from "../helpers/afx";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchAfxDailyStats(options);
  const dailyFees = usd(stats?.dailyFeesUsd);
  const dailyRevenue = usd(stats?.dailyRevenueUsd);
  const dailySupplySideRevenue = (Number(dailyFees) - Number(dailyRevenue)).toString();

  return {
    dailyFees,
    dailyUserFees: usd(stats?.dailyUserFeesUsd ?? stats?.dailyFeesUsd),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  UserFees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  Revenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
  SupplySideRevenue: "Trading fees not retained as protocol revenue.",
  ProtocolRevenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
};

const breakdownMethodology = {
  Fees: {
    TradingFees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  },
  UserFees: {
    TradingFees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  },
  Revenue: {
    ProtocolRevenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
  },
  SupplySideRevenue: {
    SupplySideRevenue: "Trading fees not retained as protocol revenue.",
  },
  ProtocolRevenue: {
    ProtocolRevenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: AFX_START,
  methodology,
  breakdownMethodology,
};

export default adapter;
