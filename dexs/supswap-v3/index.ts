import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_clrhmyxsvvuao01tu4aqj653e/subgraphs/supswap-exchange-v3/1.0.0/gn"
}

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "supDayData",
    field: VOLUME_USD,
  },
  dailyFees: {
    factory: "supDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 33.33,
    HoldersRevenue: 0,
    Fees: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 66.67, // 66% of fees are going to LPs
    Revenue: 33.33 // Revenue is 33% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MODE]: {
      fetch: v3Graphs(CHAIN.MODE),
      start: 1706313600,
    },
  },
};

export default adapter;
