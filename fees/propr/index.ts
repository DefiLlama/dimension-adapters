import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const PROPR_API = "https://www.propr.xyz/api/propr";
const REVENUE_HISTORY_DAYS = 1000;
const PAYOUTS = "0x6E810d5c33a4355cE1b4107F5722787bFD7AcF24";
const PAYOUT_EVENT = "event PayoutEvent(uint8 indexed reason, bytes12 indexed payoutId, bytes12 indexed userId, bytes12 accountId, address token, uint256 amount, address from, address to, address signer)";
const TRADER_PAYOUT_SENDER = "0xffbe8e30b2a91dfaff70170aa3388bda565137e6";
const AFFILIATE_PAYOUT_SENDER = "0x7628a3a0178b77c6dae92c8bef347e6748b0d056";


const LABELS = {
  challengeFees: "Challenge Fees & Subscriptions",
  profitSplit: "Trader Profit Split",
  affiliates: "Referral & Affiliate Commissions"
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
    if (log.from.toLowerCase() === TRADER_PAYOUT_SENDER) {
        const userPayoutAmount = BigInt(log.amount.toString());
        dailyFees.add(log.token, userPayoutAmount / 4n, LABELS.profitSplit);
    }
    else if (log.from.toLowerCase() === AFFILIATE_PAYOUT_SENDER) {
        dailySupplySideRevenue.add(log.token, log.amount, LABELS.affiliates);
    } 
  }
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue, LABELS.challengeFees);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
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
    Fees: "Challenge fees and subscriptions from Propr's public revenue API, plus Propr's retained trader profit split derived from on-chain payout events.",
    Revenue: "Challenge fees and subscriptions plus retained trader profit split, net of referral and affiliate commissions.",
    SupplySideRevenue: "Referral and affiliate commissions paid from Propr's affiliate payout sender.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.challengeFees]: "Daily platform revenue from challenge fees and subscriptions, reported by Propr's public transparency API.",
      [LABELS.profitSplit]: "The retained 20% on processed trader payouts."
    },
    Revenue: {
      [LABELS.challengeFees]: "Daily platform revenue from challenge fees and subscriptions, reported by Propr's public transparency API.",
      [LABELS.profitSplit]: "The retained 20% on processed trader payouts."
    },
    SupplySideRevenue: {
      [LABELS.affiliates]: "Referral and affiliate commissions paid from Propr's affiliate payout sender."
    }
  }
};

export default adapter;
