import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CTCJRpNgyiCMaQhPsKTWfsCfFBSPkzaQKKi2EjMyidCt'),
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
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
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: v3Graphs(CHAIN.BSC),
      start: '2024-01-09'
    },
  },
};

export default adapter;
