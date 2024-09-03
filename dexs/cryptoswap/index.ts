import * as sdk from "@defillama/sdk";
const {
  getChainVolume2,
  DEFAULT_TOTAL_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint(
    "46UXg1gyUFk7q8WrmNEMp7qoc2paiDqy5HpMvF4UQBze",
  ),
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "cstfactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: graphs(CHAIN.BSC),
      start: getStartTimestamp({
        endpoints,
        chain: CHAIN.BSC,
        dailyDataField: "cstdayDatas",
      }),
    },
  },
};

export default adapter;
