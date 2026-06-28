import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.CITREA]:
    "https://api.goldsky.com/api/public/project_cmamb6kkls0v2010932jjhxj4/subgraphs/analytics-mainnet/v1.0.3/gn",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  totalFees: {
    factory: "factories",
    field: "totalFeesUSD",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CITREA]: {
      fetch: v3Graphs(CHAIN.CITREA),
      // Analytics subgraph genesis on Citrea mainnet (first indexed day).
      start: "2026-01-20",
      meta: {
        methodology: {
          Volume:
            "Daily volume is the delta of factories.totalVolumeUSD between day boundaries.",
          Fees: "Daily fees are the delta of factories.totalFeesUSD between day boundaries.",
        },
      },
    },
  },
};

export default adapter;
