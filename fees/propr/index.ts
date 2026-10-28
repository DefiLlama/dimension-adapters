import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const PROPR_API = "https://www.propr.xyz/gateway";
const REVENUE_HISTORY_DAYS = 365;
const PAYOUTS = "0x6E810d5c33a4355cE1b4107F5722787bFD7AcF24";
const PAYOUT_EVENT = "event PayoutEvent(uint8 indexed reason, bytes12 indexed payoutId, bytes12 indexed userId, bytes12 accountId, address token, uint256 amount, address from, address to, address signer)";

const LABELS = {
  challengeFees: "Challenge Fees & Subscriptions",
  netChallengeFees: "Net Challenge Fees",
  traderPayouts: "Trader Payouts",
  affiliates: "Referral & Affiliate Commissions",
  otherPayouts: "Other Payouts To Users",
};

type RevenueHistoryResponse = {
  history: Array<{
    date: string;
    dailyRevenue: number;
  }>;
};

async function fetch(options: FetchOptions) {
  const [revenueHistory, payoutLogs]: [RevenueHistoryResponse, any[]] = await Promise.all([
    httpGet(`${PROPR_API}/v1/stats/revenue/history?days=${REVENUE_HISTORY_DAYS}`),
    options.getLogs({ target: PAYOUTS, eventAbi: PAYOUT_EVENT }),
  ]);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const revenueRow = revenueHistory.history.find((row) => row.date === options.dateString);
  if (!revenueRow) throw new Error(`Propr revenue history missing date ${options.dateString}`);

  dailyFees.addUSDValue(Number(revenueRow.dailyRevenue), LABELS.challengeFees);

  for (const log of payoutLogs) {
    const reason = Number(log.reason);
    const label = reason === 1 ? LABELS.traderPayouts : reason === 2 ? LABELS.affiliates : LABELS.otherPayouts;
    dailySupplySideRevenue.add(log.token, log.amount, label);
  }
  const dailyRevenue = dailyFees.clone(1, LABELS.netChallengeFees);
  dailyRevenue.subtract(dailySupplySideRevenue, LABELS.netChallengeFees);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-04-07"
    }
  },
  methodology: {
    Fees: "Challenge fees and subscriptions from Propr's public revenue API.",
    Revenue: "Challenge fees and subscriptions, net of all trader payouts and referral and affiliate commissions.",
    SupplySideRevenue: "All payouts from Propr's on-chain payout contract: trader profit payouts, referral and affiliate commissions, and other payouts to users.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.challengeFees]: "Daily platform revenue from challenge fees and subscriptions, reported by Propr's public transparency API.",
    },
    Revenue: {
      [LABELS.netChallengeFees]: "Challenge fees and subscriptions minus trader payouts and referral and affiliate commissions.",
    },
    SupplySideRevenue: {
      [LABELS.traderPayouts]: "Profit payouts to funded traders (payout reason 1).",
      [LABELS.affiliates]: "Referral and affiliate commissions (payout reason 2).",
      [LABELS.otherPayouts]: "Payouts to users with any other reason code.",
    }
  }
};

export default adapter;
