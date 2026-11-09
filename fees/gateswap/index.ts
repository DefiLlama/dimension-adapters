import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { gateSwapChainConfig, getGateSwapChainData, prefetchGateSwapDimensions } from "../../helpers/gateswap";

const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";
const SWAP_FEES_TO_INTEGRATORS = "Swap Fees To Integrators";

async function fetch(options: FetchOptions) {
  const row = getGateSwapChainData(options);
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(row.feesUsd, SWAP_FEES);
  dailyUserFees.addUSDValue(row.userFeesUsd, SWAP_FEES);
  dailyRevenue.addUSDValue(row.revenueUsd, SWAP_FEES_TO_PROTOCOL);
  dailyProtocolRevenue.addUSDValue(row.protocolRevenueUsd, SWAP_FEES_TO_PROTOCOL);
  dailySupplySideRevenue.addUSDValue(row.supplySideRevenueUsd, SWAP_FEES_TO_INTEGRATORS);

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch: prefetchGateSwapDimensions,
  methodology: {
    Fees: "Fees paid by users on Gate Swap routes, reported by the Gate Swap API for each hourly UTC window.",
    UserFees: "Fees paid directly by Gate Swap users.",
    Revenue: "The portion of swap fees retained by Gate Swap.",
    ProtocolRevenue: "Swap fee revenue allocated to the Gate Swap protocol.",
    SupplySideRevenue: "The portion of swap fees paid to integrators, referrers, or other route suppliers.",
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: "Fees paid by users on Gate Swap routes." },
    UserFees: { [SWAP_FEES]: "Fees paid directly by Gate Swap users." },
    Revenue: { [SWAP_FEES_TO_PROTOCOL]: "Swap fees retained by Gate Swap." },
    ProtocolRevenue: { [SWAP_FEES_TO_PROTOCOL]: "Swap fees allocated to the Gate Swap protocol." },
    SupplySideRevenue: { [SWAP_FEES_TO_INTEGRATORS]: "Swap fees paid to integrators, referrers, or other route suppliers." },
  },
  adapter: Object.fromEntries(
    Object.entries(gateSwapChainConfig).map(([chain, { start }]) => [chain, { fetch, start }]),
  ),
};

export default adapter;
