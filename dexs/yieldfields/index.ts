import * as sdk from "@defillama/sdk";
const { BSC } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('6PGfw9826xTB8JNN9HuMyY5eaFZLq6uqUcBwH7YEytsZ'),
};

const DAILY_VOLUME_FACTORY = "yieldFieldsDayData";

const graphs = getChainVolume2({
  graphUrls: {
    [BSC]: endpoints[BSC],
  },
  totalVolume: {
    factory: "yieldFieldsFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [BSC]: {
      fetch: graphs(BSC),
    },
  },
};

export default adapter;
