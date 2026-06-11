import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const FEE_TREASURY = "0x31415995b2ffaDf05FE929fDB6a87FD18A2817dD";
const REVENUE_TO_HOLDERS_RATIO = 0.5;
const REVENUE_TO_PROTOCOL_RATIO = 0.5;

const PITEAS_METRICS = {
  SwapFees: METRIC.SWAP_FEES,
  SwapFeesToProtocolDevelopment: "Swap Fees To Protocol Development",
  PTSBuyBack: METRIC.TOKEN_BUY_BACK,
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const treasuryInflows = options.createBalances();

  await addTokensReceived({
    options,
    target: FEE_TREASURY,
    balances: treasuryInflows,
    skipIndexer: true,
  });

  dailyFees.add(treasuryInflows, PITEAS_METRICS.SwapFees);
  dailyUserFees.add(treasuryInflows, PITEAS_METRICS.SwapFees);
  dailyRevenue.add(treasuryInflows, PITEAS_METRICS.SwapFees);

  dailyHoldersRevenue.add(
    dailyRevenue.clone(REVENUE_TO_HOLDERS_RATIO),
    PITEAS_METRICS.PTSBuyBack,
  );
  dailyProtocolRevenue.add(
    dailyRevenue.clone(REVENUE_TO_PROTOCOL_RATIO),
    PITEAS_METRICS.SwapFeesToProtocolDevelopment,
  );

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "ERC20 token transfers received by the Piteas fee treasury on PulseChain. Native PLS internal transfers are excluded because PulseChain is not supported by Allium or Dune.",
  UserFees: "Swap fees paid by users routing trades through the Piteas aggregator, tracked as ERC20 inflows to the fee treasury.",
  Revenue: "All ERC20 swap fees received by the fee treasury are kept by the protocol.",
  ProtocolRevenue: "50% of protocol revenue allocated to protocol development and operations per protocol policy.",
  HoldersRevenue: "50% of protocol revenue allocated to PTS market buybacks per protocol policy.",
  SupplySideRevenue: "No supply-side revenue; Piteas does not share fees with liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [PITEAS_METRICS.SwapFees]:
      "ERC20 swap fees routed to the Piteas fee treasury from aggregator trades on PulseChain.",
  },
  UserFees: {
    [PITEAS_METRICS.SwapFees]:
      "ERC20 swap fees paid by users routing trades through the Piteas aggregator.",
  },
  Revenue: {
    [PITEAS_METRICS.SwapFees]:
      "All ERC20 swap fees received by the Piteas fee treasury.",
  },
  ProtocolRevenue: {
    [PITEAS_METRICS.SwapFeesToProtocolDevelopment]:
      "Half of treasury inflows allocated to protocol development and operations.",
  },
  HoldersRevenue: {
    [PITEAS_METRICS.PTSBuyBack]:
      "Half of treasury inflows allocated to PTS market buybacks per protocol policy.",
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
