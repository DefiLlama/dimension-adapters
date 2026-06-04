import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const PROPR_API = "https://www.propr.xyz/api/propr";
const REVENUE_HISTORY_DAYS = 1000;

const LABELS = {
  challengeFees: "Challenge Fees & Subscriptions",
  profitSplit: "Trader Profit Split",
};

type RevenueHistoryResponse = {
  history: Array<{
    date: string;
    dailyRevenue: number;
  }>;
};

type Payout = {
  status: string;
  processedAt?: string | null;
  systemAmount?: string | null;
};

async function fetch(options: FetchOptions) {
  const [revenueHistory, payouts]: [RevenueHistoryResponse, Payout[]] = await Promise.all([
    httpGet(`${PROPR_API}/v1/stats/revenue/history?days=${REVENUE_HISTORY_DAYS}`),
    httpGet("https://www.propr.xyz/api/transparency/api-payouts"),
  ]);

  const dailyFees = options.createBalances();
  const revenueRow = revenueHistory.history.find((row) => row.date === options.dateString);
  if (!revenueRow) throw new Error(`Propr revenue history missing date ${options.dateString}`);

  dailyFees.addUSDValue(Number(revenueRow.dailyRevenue), LABELS.challengeFees);

  const profitSplit = payouts
    .filter((payout) => payout.status === "processed" && payout.processedAt?.slice(0, 10) === options.dateString)
    .reduce((sum, payout) => sum + Number(payout.systemAmount ?? 0), 0);

  dailyFees.addUSDValue(profitSplit, LABELS.profitSplit);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-04-07"
    }
  },
  methodology: {
    Fees: "Challenge fees and subscriptions from Propr's public revenue API, plus Propr's retained trader profit split from processed payout records.",
    Revenue: "Challenge fees and subscriptions from Propr's public revenue API, plus Propr's retained trader profit split from processed payout records.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.challengeFees]: "Daily platform revenue from challenge fees and subscriptions, reported by Propr's public transparency API.",
      [LABELS.profitSplit]: "The retained 20% on processed trader payouts."
    },
    Revenue: {
      [LABELS.challengeFees]: "Daily platform revenue from challenge fees and subscriptions, reported by Propr's public transparency API.",
      [LABELS.profitSplit]: "The retained 20% on processed trader payouts."
    }
  }
};

export default adapter;
