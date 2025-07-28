import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.XDC]: "https://analytics.xspswap.finance/subgraphs/name/xswap/factory"
}

const graphs = getGraphDimensions2({
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
      start: '2022-03-23',
    },
  },
}
export default adapters;
