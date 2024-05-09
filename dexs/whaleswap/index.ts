import { SimpleAdapter } from "../../adapters/types";

const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { BSC, FANTOM } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [BSC]: "https://api.thegraph.com/subgraphs/name/whale-swap/exchange-bsc",
  [FANTOM]: "https://api.thegraph.com/subgraphs/name/whale-swap/exchange-ftm",
};

const DAILY_VOLUME_FACTORY = "dayData";

const graphs = getChainVolume({
  graphUrls: {
    [BSC]: endpoints[BSC],
    [FANTOM]: endpoints[FANTOM],
  },
  totalVolume: {
    factory: "whaleswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [BSC]: {
      fetch: graphs(BSC),
      start: getStartTimestamp({
        endpoints,
        chain: BSC,
        dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
      }),
    },
    [FANTOM]: {
      fetch: graphs(FANTOM),
      start: getStartTimestamp({
        endpoints,
        chain: FANTOM,
        dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
      }),
    },
  },
};

export default adapter;
