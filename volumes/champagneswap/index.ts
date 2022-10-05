import { SimpleAdapter } from "../../adapters/types";

const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { BSC } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [BSC]: "https://api.thegraph.com/subgraphs/name/champagneswap/exchangev3",
};

const DAILY_VOLUME_FACTORY = "champagneDayData";

const graphs = getChainVolume({
  graphUrls: {
    [BSC]: endpoints[BSC],
  },
  totalVolume: {
    factory: "champagneFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [BSC]: {
      fetch: graphs(BSC),
      start: getStartTimestamp({
        endpoints,
        chain: BSC,
        dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
      }),
    },
  },
};

export default adapter;
