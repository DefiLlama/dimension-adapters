import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.MANTLE]: "https://graphv3.fusionx.finance/subgraphs/name/fusionx/exchange-v3"
}

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "fusionXDayData",
    field: VOLUME_USD,
  },
  dailyFees: {
    factory: "fusionXDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 16.7,
    HoldersRevenue: 16.7,
    Fees: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 66.6, // 66% of fees are going to LPs
    Revenue: 33.4 // Revenue is 33% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: v3Graphs(CHAIN.MANTLE),
      start: 1689206400,
    },
  },
};

export default adapter;
