import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { TRISTERO_CHAINS, TRISTERO_START, fetchTristeroGasAbstractionFees } from "../helpers/tristero";

const fetch = async (options: FetchOptions) => {
  const { fees, revenue, hasUnattributedFees } = await fetchTristeroGasAbstractionFees(options);
  return {
    dailyFees: fees,
    dailyUserFees: fees.clone(),
    // Unknown beneficiaries are unavailable, not zero. Never extrapolate the confirmed
    // operating-wallet split to other fillers or publish a partial total as full revenue.
    ...(hasUnattributedFees ? {} : {
      dailyRevenue: revenue,
      dailyProtocolRevenue: revenue.clone(),
      dailySupplySideRevenue: options.createBalances(),
    }),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Other filler beneficiaries cannot be inferred from receipt data alone.
  skipBreakdownValidation: true,
  fetch,
  chains: TRISTERO_CHAINS,
  start: TRISTERO_START,
  methodology: {
    Fees: "Executed gas-abstraction charges on Tristero router source and destination transactions; excludes principal, refunds, lender interest, vault yield and underlying DEX/bridge fees.",
    UserFees: "Gas-abstraction charges paid from users' order proceeds on source and destination transactions.",
    Revenue: "Gas-abstraction charges retained by verified Tristero operating wallets; unavailable for windows with charges to unverified filler beneficiaries.",
    ProtocolRevenue: "Gas-abstraction charges retained by verified Tristero operating wallets; excludes lender principal, yield and any modeled charge on vault capital.",
    SupplySideRevenue: "Zero for the verified execution charges retained by Tristero; unavailable when another filler's beneficiary split is unverified.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges on source and destination orders." },
    UserFees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges paid from order proceeds." },
    Revenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
    ProtocolRevenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
  },
};

export default adapter;
