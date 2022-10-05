import { BreakdownAdapter, DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";

const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { BSC } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [BSC]: "https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2",
};

const DAILY_VOLUME_FACTORY = "pancakeDayData";

const graphs = getChainVolume({
  graphUrls: {
    [BSC]: endpoints[BSC],
  },
  totalVolume: {
    factory: "pancakeFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter
    },
    v2: {
      [BSC]: {
        fetch: graphs(BSC),
        start: getStartTimestamp({
          endpoints,
          chain: BSC,
          dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
        }),
      }
    },
  },
};

export default adapter;
