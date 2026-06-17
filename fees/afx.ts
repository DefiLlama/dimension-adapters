import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { AFX_START, fetchAfxDailyStats, usd } from "../helpers/afx";

const TRADING_FEES = "Trading Fees";
const TRADING_FEES_TO_PROTOCOL = "Trading Fees To Protocol";
const TRADING_FEES_TO_REFERRALS_TRADER_REWARDS_AND_POINTS = "Trading Fees To Referrals, Trader Rewards And Points";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchAfxDailyStats(options);
  const dailyFeesUsd = Number(usd(stats?.dailyFeesUsd));
  const dailyUserFeesUsd = Number(usd(stats?.dailyUserFeesUsd ?? stats?.dailyFeesUsd));
  const dailyRevenueUsd = Number(usd(stats?.dailyRevenueUsd));
  const dailySupplySideRevenueUsd = dailyFeesUsd - dailyRevenueUsd;

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyFeesUsd, TRADING_FEES);
  dailyUserFees.addUSDValue(dailyUserFeesUsd, TRADING_FEES);
  dailyRevenue.addUSDValue(dailyRevenueUsd, TRADING_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.addUSDValue(dailySupplySideRevenueUsd, TRADING_FEES_TO_REFERRALS_TRADER_REWARDS_AND_POINTS);
  dailyProtocolRevenue.addUSDValue(dailyRevenueUsd, TRADING_FEES_TO_PROTOCOL);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  UserFees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  Revenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
  SupplySideRevenue: "Trading fees not retained as protocol revenue, including referral rebates, trader rewards, Points Program rewards, and other non-protocol allocations. See https://docs.afx.xyz and https://medium.com/@AFXTrade for more details.",
  ProtocolRevenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "Trading fees paid by AFX perpetual traders, excluding funding.",
  },
  UserFees: {
    [TRADING_FEES]: "Trading fees paid by AFX perpetual traders, excluding funding.",
  },
  Revenue: {
    [TRADING_FEES_TO_PROTOCOL]: "Trading fees retained as protocol revenue, as reported by the AFX daily revenue distribution data.",
  },
  SupplySideRevenue: {
    [TRADING_FEES_TO_REFERRALS_TRADER_REWARDS_AND_POINTS]: "Trading fees not retained as protocol revenue, including referral rebates, trader rewards, Points Program rewards, and other non-protocol allocations. See https://docs.afx.xyz and https://medium.com/@AFXTrade for more details.",
  },
  ProtocolRevenue: {
    [TRADING_FEES_TO_PROTOCOL]: "Trading fees retained as protocol revenue, as reported by the AFX daily revenue distribution data.",
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
