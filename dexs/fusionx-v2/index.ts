import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.MANTLE]: "https://graphv3.fusionx.finance/subgraphs/name/fusionx/exchange"
}

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "fusionxFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    ProtocolRevenue: 0.04,
    HoldersRevenue: 0.04,
    Fees: 0.25, // 0.25% fees
    UserFees: 0.25, // User fees are 100% of collected fees
    SupplySideRevenue: 0.17, // 66% of fees are going to LPs
    Revenue: 0.08 // Revenue is 33% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: v2Graphs(CHAIN.MANTLE),
      start: '2023-07-13',
    },
  },
};

export default adapter;
