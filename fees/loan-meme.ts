import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpPost } from "../utils/fetchURL";

// Loan Meme: memecoin collateral, stablecoin loans, one isolated market per collateral token.
// Website: https://loanmeme.io  Docs: https://loanmeme.io/docs  Twitter: https://x.com/loanmeme
// Public, unauthenticated GraphQL analytics API; schema at https://api.loanmeme.io/api/graphql/schema
const API_URL = "https://api.loanmeme.io/api/graphql";

// network ids as the API labels them: "<chain family>:<chain id>"
const NETWORK_ID: Record<string, string> = {
  [CHAIN.ETHEREUM]: "EVM:1",
};

// one point per UTC calendar day, ending today; 366 days is the most the API serves.
// totalUsd is every fee charged that day, in USD at the moment it was charged, or null
// when the oracle had no usable price for one of them.
const QUERY = `query ($networkId: String!) {
  fees(days: 366, networkId: $networkId) { history { day totalUsd } }
}`;

const fetch = async (options: FetchOptions) => {
  const res = await httpPost(API_URL, { query: QUERY, variables: { networkId: NETWORK_ID[options.chain] } });
  if (res.errors?.length) throw new Error(`Loan Meme API: ${res.errors.map((e: any) => e.message).join("; ")}`);

  const point = res.data.fees.history.find((p: { day: string }) => p.day === options.dateString);
  if (!point) throw new Error(`Loan Meme API: no fee history for ${options.dateString}`);
  if (point.totalUsd === null) throw new Error(`Loan Meme API: fees unpriced on ${options.dateString}`);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(point.totalUsd), METRIC.PROTOCOL_FEES);
  // every fee goes to the protocol treasury in full
  const dailyRevenue = dailyFees.clone();

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const FEES_DESCRIPTION = "Fees charged on borrows, repayments, and lending deposits and withdrawals.";

const adapter: SimpleAdapter = {
  version: 1, // the API serves whole UTC days only
  fetch,
  chains: Object.keys(NETWORK_ID),
  start: "2026-10-01", // first UTC day with settled operations
  methodology: {
    Fees: "Fees Loan Meme charges on borrows, repayments, and lending deposits and withdrawals, in USD at the time they are charged.",
    Revenue: "All of the fees (Borrow, Repay, Deposit, Withdraw); the protocol treasury keeps them in full.",
    ProtocolRevenue: "All of the fees (Borrow, Repay, Deposit, Withdraw); the protocol treasury keeps them in full.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.PROTOCOL_FEES]: FEES_DESCRIPTION },
    Revenue: { [METRIC.PROTOCOL_FEES]: FEES_DESCRIPTION },
    ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: FEES_DESCRIPTION },
  },
};

export default adapter;
