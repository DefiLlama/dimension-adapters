import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import {
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
} from "../helpers/getUniSubgraphVolume";

const v2Graph = getGraphDimensions2({
  graphUrls: {
    [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v2/prod/gn",
  },
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    SupplySideRevenue: 0.06,
    ProtocolRevenue: 0.24,
    Revenue: 0.3,
    Fees: 0.3,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.06% of each swap.",
    ProtocolRevenue: "Treasury receives 0.24% of each swap.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees come from the user.",
  },
  adapter: {
    [CHAIN.MODE]: {
      fetch: v2Graph,
      start: '2024-02-01',
    },
  },
};

export default adapter;
