import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD } from "../../helpers/getUniSubgraphFees";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { SimpleAdapter } from "../../adapters/types";

const endpoint: any = {
  [CHAIN.HARMONY]: 'https://graph.swap.country/subgraphs/name/harmony-uniswap-v3',
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
      fetch: v3Graphs,
    },
  },
};


export default adapters;
