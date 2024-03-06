import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.LIGHTLINK_PHOENIX]: "https://subgraph.elektrik.network/subgraphs/name/ELEKTRIK-GRAPH",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.LIGHTLINK_PHOENIX]: {
      fetch: graphs(CHAIN.LIGHTLINK_PHOENIX),
      start: 1697155200
    },
  },
};

export default adapter;
