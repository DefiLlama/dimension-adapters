import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { TRISTERO_CHAINS, TRISTERO_START, fetchTristeroGasAbstractionFees } from "../helpers/tristero";

const fetch = async (options: FetchOptions) => {
  const { fees, revenue, hasUnattributedFees } = await fetchTristeroGasAbstractionFees(options);
  // Omitting only the split lets hourly/chain aggregation publish partial revenue.
  // Reject the entire window until every included charge has a verified beneficiary.
  if (hasUnattributedFees) {
    throw new Error(`Unattributed Tristero execution fees on ${options.chain} from ${options.fromTimestamp} to ${options.toTimestamp}`);
  }
  return {
    dailyFees: fees,
    dailyUserFees: fees.clone(),
    dailyRevenue: revenue,
    dailyProtocolRevenue: revenue.clone(),
    dailySupplySideRevenue: options.createBalances(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: TRISTERO_CHAINS,
  start: TRISTERO_START,
  methodology: {
    Fees: "Executed gas-abstraction charges paid from users' order proceeds on Tristero router source and destination transactions; excludes principal, refunds, lender interest, vault yield and underlying DEX/bridge fees.",
    Revenue: "Gas-abstraction charges retained by verified Tristero operating wallets; windows containing charges to unverified filler beneficiaries are rejected.",
    ProtocolRevenue: "Gas-abstraction charges retained by verified Tristero operating wallets; excludes lender principal, yield and any modeled charge on vault capital.",
    SupplySideRevenue: "Zero for the verified execution charges retained by Tristero; windows containing an unverified filler beneficiary split are rejected.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges on source and destination orders." },
    UserFees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges paid from order proceeds." },
    Revenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
    ProtocolRevenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
  },
};

export default adapter;
