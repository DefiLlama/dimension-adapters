import { DEFAULT_TOTAL_VOLUME_FIELD, univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_DAILY_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/q1q0/squad-exchange",
};

const v2Graph = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "pancakeFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    Fees: 0.02,
    UserFees: 0.02,
    Revenue: 0.01,
    ProtocolRevenue: 0.005,
    HoldersRevenue: 0.005,
    SupplySideRevenue: 0.004,
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: v2Graph(CHAIN.BSC),
      start: 1702339200
    },
  },
};

export default adapter;
