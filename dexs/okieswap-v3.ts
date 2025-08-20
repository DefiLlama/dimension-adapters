import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.XLAYER]: "https://subgraph.okiedokie.fun/subgraphs/name/okieswap-v3",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 33.4,
    HoldersRevenue: 0,
    Fees: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 66.6, // 66% of fees are going to LPs
    Revenue: 33.4, // Revenue is 33% of collected fees
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch: v3Graphs,
      start: '2025-08-17',
    },
  },
};

export default adapter;
