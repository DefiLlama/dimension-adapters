import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const TRADING_FEES = "Trading Fees";
const TRADING_FEES_TO_PROTOCOL = "Trading Fees To Protocol";
const TRADING_FEES_TO_REWARDS = "Trading Fees To Referrals and Rewards";

const API = "https://api10.afx.xyz/info/integrations/defillama";
const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "defillama-dimension-adapters/1.0",
};
const AFX_START = "2026-05-29";

type DataResponse<T> = {
  code: number;
  message?: string;
  data: T;
};

type AfxDailyStats = {
  dataStatus: 'READY' | 'PENDING' | 'FAILED';
  timestamp: number;
  date: string;
  dailyVolumeUsd?: string | null;
  dailyFeesUsd?: string | null;
  dailyUserFeesUsd?: string | null;
  openInterestUsd?: string | null;
  dailyRevenueUsd?: string | null;
  activeOrderUsers?: number | null;
};

async function get<T>(url: string): Promise<T> {
  const response = await httpGet(url, { headers: HEADERS }) as DataResponse<unknown>;
  if (response.code !== 0) {
    throw new Error(`afx: ${response.message ?? "unexpected API response"}`);
  }
  return response as T;
}

async function fetchAfxDailyStats(options: FetchOptions): Promise<AfxDailyStats> {
  const start = options.startOfDay
  const end = start + 86_400; // window end, +1 day in seconds
  const { data } = await get<DataResponse<AfxDailyStats[]>>(`${API}/protocol/daily?start=${start}&end=${end}`);
  options.api.log(`afx: fetched daily stats for ${options.dateString} (${data?.length ?? 0} rows)`, data);
  const row = (data ?? []).find((r) => r.timestamp === start || r.date === options.dateString);
  if (!row || row.dataStatus !== 'READY') throw new Error(`afx: missing daily stats for ${options.dateString}`);
  return row;
}

const usd = (value?: string | number | null) => value ?? "0";

const fetch = async (options: FetchOptions): Promise<any> => {
  const stats = await fetchAfxDailyStats(options);
  const dailyFeesUsd = Number(usd(stats.dailyFeesUsd));
  const dailyUserFeesUsd = Number(usd(stats.dailyUserFeesUsd ?? stats.dailyFeesUsd));
  const dailyRevenueUsd = Number(usd(stats.dailyRevenueUsd));
  const dailySupplySideRevenueUsd = dailyFeesUsd - dailyRevenueUsd;

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyFeesUsd, TRADING_FEES);
  dailyUserFees.addUSDValue(dailyUserFeesUsd, TRADING_FEES);
  dailyRevenue.addUSDValue(dailyRevenueUsd, TRADING_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.addUSDValue(dailySupplySideRevenueUsd, TRADING_FEES_TO_REWARDS);
  dailyProtocolRevenue.addUSDValue(dailyRevenueUsd, TRADING_FEES_TO_PROTOCOL);

  return {
    // activeOrderUsers = daily distinct users with new_order_count > 0
    dailyActiveUsers: stats.activeOrderUsers,
    dailyVolume: usd(stats.dailyVolumeUsd),
    openInterestAtEnd: usd(stats.openInterestUsd),
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume: "Single-sided (taker-side) AFX perpetual trading volume in USD, including liquidation fills.",
  Fees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  UserFees: "Trading fees paid by AFX perpetual traders, excluding funding.",
  Revenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
  SupplySideRevenue: "Trading fees not retained as protocol revenue, including referral rebates, trader rewards, Points Program rewards, and other non-protocol allocations.",
  ProtocolRevenue: "Protocol revenue reported by the AFX daily revenue distribution data.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "Trading fees paid by AFX perpetual traders.",
  },
  UserFees: {
    [TRADING_FEES]: "Trading fees paid by AFX perpetual traders.",
  },
  Revenue: {
    [TRADING_FEES_TO_PROTOCOL]: "Trading fees retained as protocol revenue, as reported by the AFX daily revenue distribution data.",
  },
  SupplySideRevenue: {
    [TRADING_FEES_TO_REWARDS]: "Trading fees not retained as protocol revenue, including referral rebates, trader rewards, Points Program rewards, and other non-protocol allocations.",
  },
  ProtocolRevenue: {
    [TRADING_FEES_TO_PROTOCOL]: "Trading fees retained as protocol revenue, as reported by the AFX daily revenue distribution data.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AFX],
  start: AFX_START,
  methodology,
  breakdownMethodology,
};

export default adapter;
