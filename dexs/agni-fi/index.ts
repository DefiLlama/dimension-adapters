import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.MANTLE]: "https://agni.finance/graph/subgraphs/name/agni/exchange-v3"
}

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD,
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: v3Graphs(CHAIN.MANTLE),
      start: 1689724800,
    },
  },
};

export default adapter;
