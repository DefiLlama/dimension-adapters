import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived, getETHReceived } from "../../helpers/token";

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

  const treasuryInflows = options.createBalances();

  await addTokensReceived({
    options,
    target: FEE_TREASURY,
    balances: treasuryInflows,
    skipIndexer: true,
  });

  await getETHReceived({
    options,
    target: FEE_TREASURY,
    balances: treasuryInflows,
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
  };
};

const methodology = {
  Fees: "Protocol swap fees received by the dedicated Piteas fee treasury, including native PLS (internal transfers) and ERC20 token transfers.",
  UserFees: "Swap fees paid by users routing trades through the Piteas aggregator.",
  Revenue: "All protocol swap fees received by the fee treasury are kept by the protocol.",
  ProtocolRevenue: "50% of protocol revenue allocated to protocol development and operations.",
  HoldersRevenue: "50% of protocol revenue used for PTS market buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [PITEAS_METRICS.SwapFees]:
      "Swap fees routed to the Piteas fee treasury from aggregator trades on PulseChain, in native PLS or ERC20.",
  },
  UserFees: {
    [PITEAS_METRICS.SwapFees]:
      "Swap fees paid by users routing trades through the Piteas aggregator.",
  },
  Revenue: {
    [PITEAS_METRICS.SwapFees]:
      "All swap fees received by the Piteas fee treasury.",
  },
  ProtocolRevenue: {
    [PITEAS_METRICS.SwapFeesToProtocolDevelopment]:
      "Half of treasury inflows allocated to protocol development and operations.",
  },
  HoldersRevenue: {
    [PITEAS_METRICS.PTSBuyBack]:
      "Half of treasury inflows used to buy PTS from the market.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.PULSECHAIN]: {
      start: "2023-07-07",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
