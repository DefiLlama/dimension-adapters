import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

// https://docs.piteas.io/contracts
const FEE_TREASURY = "0x31415995b2ffaDf05FE929fDB6a87FD18A2817dD";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const fees = await addTokensReceived({
    options,
    target: FEE_TREASURY,
  });

  const dailyFees = fees.clone(1, METRIC.SWAP_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0
  };
};

const methodology = {
  Fees: "ERC20 token transfers received by the Piteas fee treasury on PulseChain. Native PLS internal transfers are excluded because PulseChain is not supported by Allium or Dune.",
  UserFees: "Swap fees paid by users routing trades through the Piteas aggregator, tracked as ERC20 inflows to the fee treasury.",
  Revenue: "All ERC20 swap fees received by the fee treasury are kept by the protocol.",
  ProtocolRevenue: "All swap fees received by the fee treasury.",
  SupplySideRevenue: "No supply-side revenue; Piteas does not share fees with liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "ERC20 swap fees routed to the Piteas fee treasury from aggregator trades on PulseChain.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]:
      "All ERC20 swap fees received by the Piteas fee treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2023-07-07",
  chains: [CHAIN.PULSECHAIN],
  methodology,
  breakdownMethodology,
};

export default adapter;
