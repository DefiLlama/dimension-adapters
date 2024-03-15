import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.XDC]: "https://analytics.xspswap.finance/subgraphs/name/some/factory"
}

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.XDC]: {
      "origin": "https://analytics.xspswap.finance",
      "referer": "https://analytics.xspswap.finance/home"
    },
  },
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.XDC]: {
      fetch: graphs(CHAIN.XDC),
      start: 1647993600,
    },
  },
}
export default adapters;
