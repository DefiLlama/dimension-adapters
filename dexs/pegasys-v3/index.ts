import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ROLLUX]: "https://rollux.graph.pegasys.fi/subgraphs/name/pollum-io/pegasys-v3",
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});
// rollux
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROLLUX]: {
      fetch: graphs(CHAIN.ROLLUX),
      start: '2023-06-30'
    },
  },
};

export default adapter;
