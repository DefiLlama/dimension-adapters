import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.SEI]: "https://subgraph.sailor.finance/subgraphs/name/sailor"
}

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  totalFees: {
    factory: "factories",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 4,
    HoldersRevenue: 12,
    Fees: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 84, // 84% of fees are going to LPs
    Revenue: 16 // Revenue is 100% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SEI]: {
      fetch: v3Graphs(CHAIN.SEI),
      start: '2025-01-01',
    },
  },
};

export default adapter;