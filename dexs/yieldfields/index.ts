import * as sdk from "@defillama/sdk";
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { BSC } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");

import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('6PGfw9826xTB8JNN9HuMyY5eaFZLq6uqUcBwH7YEytsZ'),
};

const DAILY_VOLUME_FACTORY = "yieldFieldsDayData";

const graphs = getChainVolume({
  graphUrls: {
    [BSC]: endpoints[BSC],
  },
  totalVolume: {
    factory: "yieldFieldsFactories",
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
