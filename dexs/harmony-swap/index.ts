import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD } from "../../helpers/getUniSubgraphFees";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { SimpleAdapter } from "../../adapters/types";

const endpoint: any = {
  [CHAIN.HARMONY]: sdk.graph.modifyEndpoint("GVkp9F6TzzC5hY4g18Ukzb6gGcYDfQrpMpcj867jsenJ"),
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpoint,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HARMONY]: {
      fetch: v3Graphs(CHAIN.HARMONY),
    },
  },
};


export default adapters;
