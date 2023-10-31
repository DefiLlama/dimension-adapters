import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49147/derpdex-v3-amm/v0.0.10",
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/geckocoding/derpdex-amm-base",
  [CHAIN.OP_BNB]: "https://opbnb.subgraph.derpdex.com/subgraphs/name/geckocoding/derpdex-opbnb"
};

const v3Graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
    dateField: "date"
  },
  dailyFees: {
    factory: "uniswapDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 0% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 0% of collected fees
  }
});

const adapter: Adapter = {
    adapter: {
        [CHAIN.ERA]: {
          fetch: v3Graphs(CHAIN.ERA),
          start:  async () => 1688515200
        },
        [CHAIN.BASE]: {
          fetch: v3Graphs(CHAIN.BASE),
          start:  async () => 1692296100
        },
        [CHAIN.OP_BNB]: {
          fetch: v3Graphs(CHAIN.OP_BNB),
          start:  async () => 1695275237
        }
    }
};

export default adapter;
