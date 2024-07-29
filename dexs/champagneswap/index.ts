import * as sdk from "@defillama/sdk";
import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";

const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { BSC } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('9gXThrkBPCRnK5ncBGySQJZoFUUSC5RDAYYciEZ323Pj'),
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
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
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
