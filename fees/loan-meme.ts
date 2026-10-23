import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { httpPost } from "../utils/fetchURL";

// Loan Meme: memecoin collateral, stablecoin loans, one isolated market per collateral token.
// Website: https://loanmeme.io  Docs: https://loanmeme.io/docs  Twitter: https://x.com/loanmeme
// Public, unauthenticated GraphQL analytics API; schema at https://api.loanmeme.io/api/graphql/schema
const API_URL = "https://api.loanmeme.io/api/graphql";

// networkId as the API labels it: "<chain family>:<chain id>"; start is the chain's first UTC day with settled operations
const chainConfig: Record<string, { networkId: string; start: string }> = {
  [CHAIN.ETHEREUM]: { networkId: "EVM:1", start: "2026-10-01" },
  [CHAIN.BSC]: { networkId: "EVM:56", start: "2026-10-13" },
  [CHAIN.SOLANA]: { networkId: "SOLANA:1399811149", start: "2026-10-20" }, // the API's Solana chain id: 0x536f6c4d, "SolM" in ASCII
};

// share of every fee set aside for $LOAN buybacks once the token launches; the rest goes to the treasury.
// No buyback has executed yet, so the reserve stays in protocol revenue; holders revenue is added once they do.
// Routing: https://loanmeme.io/docs#h-feeflow (reserve first, surplus to the buyback contract, #h-buyback); 77% share set by the team.
const BUYBACK_RESERVE_SHARE = 0.77;
const RESERVE_LABEL = "Protocol Fees To Buyback Reserve";
const TREASURY_LABEL = "Protocol Fees To Treasury";

const FEE_SOURCES = [
  { field: "borrowingDepositUsd", label: "Borrow Origination Fees", description: "Fees charged on borrow origination." },
  { field: "borrowingRepaymentAndLiquidationsUsd", label: "Repayment and Liquidation Fees", description: "Fees charged on repayments and liquidations." },
  { field: "lendingDepositUsd", label: "Lending Deposit Fees", description: "Entry fees charged on lending contributions." },
  { field: "lendingWithdrawalUsd", label: "Lending Withdrawal Fees", description: "Exit fees charged on lending payouts and lending positions used to repay a debt." },
] as const;

// one point per UTC calendar day, ending today; 366 days is the most the API serves.
// totalUsd is every fee charged that day, in USD at the moment it was charged, or null
// when the oracle had no usable price for one of them.
const QUERY = `query ($networkId: String!) {
  fees(days: 366, networkId: $networkId) {
    history {
      day
      totalUsd
      borrowingDepositUsd
      borrowingRepaymentAndLiquidationsUsd
      lendingDepositUsd
      lendingWithdrawalUsd
    }
  }
}`;

const fetch = async (options: FetchOptions) => {
  const res = await httpPost(API_URL, { query: QUERY, variables: { networkId: chainConfig[options.chain].networkId } });
  if (res.errors?.length) throw new Error(`Loan Meme API: ${res.errors.map((e: any) => e.message).join("; ")}`);

  const point = res.data?.fees?.history?.find((p: { day: string }) => p.day === options.dateString);
  if (!point) throw new Error(`Loan Meme API: no fee history for ${options.dateString}`);
  const value = (field: string) => {
    if (point[field] == null) throw new Error(`Loan Meme API: ${field} unpriced or missing on ${options.dateString}`);
    const amount = new BigNumber(point[field]);
    if (!amount.isFinite()) throw new Error(`Loan Meme API: invalid ${field} on ${options.dateString}`);
    return amount;
  };
  const total = value("totalUsd");

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  let sum = new BigNumber(0);
  for (const { field, label } of FEE_SOURCES) {
    const amount = value(field);
    dailyFees.addUSDValue(amount.toFixed(), label);
    dailyRevenue.addUSDValue(amount.toFixed(), `${label} To Protocol`);
    sum = sum.plus(amount);
  }
  if (!sum.eq(total)) throw new Error(`Loan Meme API: fee breakdown does not match totalUsd on ${options.dateString}`);
  // the protocol keeps every fee: 77% into the buyback reserve, 23% to the treasury
  const dailyProtocolRevenue = dailyFees.clone(BUYBACK_RESERVE_SHARE, RESERVE_LABEL);
  dailyProtocolRevenue.addBalances(dailyFees.clone(1 - BUYBACK_RESERVE_SHARE, TREASURY_LABEL));

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 1, // the API serves whole UTC days only
  allowNegativeValue: true, // signed accounting corrections can reduce a day's fees or an individual source
  fetch,
  adapter: chainConfig, // start dates are read from chainConfig per chain
  methodology: {
    Fees: "Borrow origination, repayment and explicit liquidation fees, and lending entry and exit fees, valued in USD when charged.",
    Revenue: "All of the fees (Borrow, Repay, Deposit, Withdraw); the protocol keeps them in full.",
    ProtocolRevenue: "All of the fees (Borrow, Repay, Deposit, Withdraw): 77% is set aside for $LOAN buybacks at token launch and 23% goes to the treasury. No buyback has executed yet; holders revenue will be reported once they do.",
  },
  breakdownMethodology: {
    Fees: Object.fromEntries(FEE_SOURCES.map(({ label, description }) => [label, description])),
    Revenue: Object.fromEntries(FEE_SOURCES.map(({ label }) => [`${label} To Protocol`, `All ${label.toLowerCase()} are retained by the protocol.`])),
    ProtocolRevenue: {
      [RESERVE_LABEL]: "77% of the fees, set aside for $LOAN buybacks at token launch.",
      [TREASURY_LABEL]: "23% of the fees, kept by the protocol treasury.",
    },
  },
};

export default adapter;
