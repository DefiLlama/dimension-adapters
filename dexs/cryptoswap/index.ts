import * as sdk from "@defillama/sdk";
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('46UXg1gyUFk7q8WrmNEMp7qoc2paiDqy5HpMvF4UQBze'),
};

const DAILY_VOLUME_FACTORY = "cstdayData";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "cstfactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: graphs(CHAIN.BSC),
      start: getStartTimestamp({
        endpoints,
        chain: CHAIN.BSC,
        dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
      }),
    },
  },
};

export default adapter;
