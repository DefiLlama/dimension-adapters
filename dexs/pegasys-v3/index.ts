import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ROLLUX]: "https://rollux.graph.pegasys.fi/subgraphs/name/pollum-io/pegasys-v3",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "pegasysDayData",
    field: "volumeUSD",
  },
});
// rollux
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROLLUX]: {
      fetch: graphs(CHAIN.ROLLUX),
      start: 1688083200
    },
  },
};

export default adapter;
