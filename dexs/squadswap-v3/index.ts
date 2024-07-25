import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CTCJRpNgyiCMaQhPsKTWfsCfFBSPkzaQKKi2EjMyidCt'),
};

const v3Graphs = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: "volumeUSD",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 25,
    HoldersRevenue: 25,
    UserFees: 100,
    SupplySideRevenue: 20,
    Revenue: 50
  }
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: v3Graphs(CHAIN.BSC),
      start: 1704758400
    },
  },
};

export default adapter;
