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

// share of every fee set aside for $LOAN buybacks once the token launches; the rest goes to the treasury.
// No buyback has executed yet, so the reserve stays in protocol revenue; holders revenue is added once they do.
// Routing: https://loanmeme.io/docs#h-feeflow (reserve first, surplus to the buyback contract, #h-buyback); 77% share set by the team.
const BUYBACK_RESERVE_SHARE = 0.77;
const RESERVE_LABEL = "Protocol Fees To Buyback Reserve";
const TREASURY_LABEL = "Protocol Fees To Treasury";

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
  // the protocol keeps every fee: 77% into the buyback reserve, 23% to the treasury
  const dailyRevenue = dailyFees.clone();
  const dailyProtocolRevenue = dailyFees.clone(BUYBACK_RESERVE_SHARE, RESERVE_LABEL);
  dailyProtocolRevenue.addBalances(dailyFees.clone(1 - BUYBACK_RESERVE_SHARE, TREASURY_LABEL));

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const FEES_DESCRIPTION = "Fees charged on borrows, repayments, and lending deposits and withdrawals.";

const adapter: SimpleAdapter = {
  version: 1, // the API serves whole UTC days only
  fetch,
  chains: Object.keys(NETWORK_ID),
  start: "2026-10-01", // first UTC day with settled operations
  methodology: {
    Fees: "Fees Loan Meme charges on borrows, repayments, and lending deposits and withdrawals, in USD at the time they are charged.",
    Revenue: "All of the fees (Borrow, Repay, Deposit, Withdraw); the protocol keeps them in full.",
    ProtocolRevenue: "All of the fees (Borrow, Repay, Deposit, Withdraw): 77% is set aside for $LOAN buybacks at token launch and 23% goes to the treasury. No buyback has executed yet; holders revenue will be reported once they do.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.PROTOCOL_FEES]: FEES_DESCRIPTION },
    Revenue: { [METRIC.PROTOCOL_FEES]: FEES_DESCRIPTION },
    ProtocolRevenue: {
      [RESERVE_LABEL]: "77% of the fees, set aside for $LOAN buybacks at token launch.",
      [TREASURY_LABEL]: "23% of the fees, kept by the protocol treasury.",
    },
  },
};

export default adapter;
