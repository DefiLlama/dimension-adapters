import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { TRISTERO_CHAINS, TRISTERO_START, TRISTERO_FILLER_FEE_LABEL, fetchTristeroGasAbstractionFees } from "../helpers/tristero";

const fetch = async (options: FetchOptions) => {
  const { fees, revenue, supplySideRevenue } = await fetchTristeroGasAbstractionFees(options);
  return {
    dailyFees: fees,
    dailyUserFees: fees.clone(),
    dailyRevenue: revenue,
    dailyProtocolRevenue: revenue.clone(),
    dailySupplySideRevenue: supplySideRevenue,
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
    Revenue: "Gas-abstraction charges retained by verified Tristero operating wallets; excludes charges paid to other fillers.",
    ProtocolRevenue: "Gas-abstraction charges retained by verified Tristero operating wallets; excludes lender principal, yield and any modeled charge on vault capital.",
    SupplySideRevenue: "Executed gas-abstraction charges paid to fillers outside the confirmed Tristero operating wallets.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges on source and destination orders." },
    UserFees: { [METRIC.TRANSACTION_GAS_FEES]: "Executed gas-abstraction charges paid from order proceeds." },
    Revenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
    ProtocolRevenue: { [METRIC.TRANSACTION_GAS_FEES]: "Execution charges retained by verified Tristero operating wallets." },
    SupplySideRevenue: { [TRISTERO_FILLER_FEE_LABEL]: "Execution charges paid to fillers outside the confirmed Tristero operating wallets." },
  },
};

export default adapter;
