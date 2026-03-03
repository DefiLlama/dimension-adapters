import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
} from "../helpers/getUniSubgraphVolume";

const v3Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v3/prod/gn",
  },
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 64,
    UserFees: 100,
    SupplySideRevenue: 36,
    Revenue: 0,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees:
      "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    SupplySideRevenue: "LPs receive 36% of the current swap fee",
    ProtocolRevenue: "Treasury receives 64% of each swap",
    Fees: "All fees come from the user.",
  },
  adapter: {
    [CHAIN.MODE]: {
      fetch: v3Graphs,
      start: '2024-03-11',
    },
  },
};

export default adapter;
