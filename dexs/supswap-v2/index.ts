import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_clrhmyxsvvuao01tu4aqj653e/subgraphs/supswap-exchange-v2/1.0.0/gn"
}

const v2Graphs = getGraphDimensions({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "supFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "supDayData",
    field: "dailyVolumeUSD",
  },
  feesPercent: {
    type: "volume",
    ProtocolRevenue: 0.08,
    HoldersRevenue: 0.00,
    Fees: 0.2, // 0.2% fees
    UserFees: 0.2, // User fees are 100% of collected fees
    SupplySideRevenue: 0.15, // 75% of fees are going to LPs
    Revenue: 0.05 // Revenue is 33% of collected fees
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MODE]: {
      fetch: v2Graphs(CHAIN.MODE),
      start: 1706313600,
    },
  },
};

export default adapter;
