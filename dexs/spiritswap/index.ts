import { SimpleAdapter } from "../../adapters/types";

const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  fantom:
    "https://api.thegraph.com/subgraphs/name/layer3org/spiritswap-analytics",
};

const graphs = getChainVolume({
  graphUrls: {
    fantom: endpoints.fantom,
  },
  totalVolume: {
    factory: "spiritswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "spiritswapDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    fantom: {
      fetch: graphs("fantom"),
      start: async () => 1620864000,
    },
  },
};

export default adapter;
