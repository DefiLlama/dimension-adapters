import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const fetch = getGraphDimensions2({
  graphUrls: {
    [CHAIN.BASE]: sdk.graph.modifyEndpoint(
      "3E7EJF1zWHD3LHTKV5L6dspCno2ghxZ3WYe9MN7QVnEE",
    ),
  },
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: 1704009000,
    },
  },
};

export default adapter;
