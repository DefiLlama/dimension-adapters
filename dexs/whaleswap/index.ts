import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const { BSC, FANTOM } = require("../../helpers/chains");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [BSC]: sdk.graph.modifyEndpoint('6GFVtwE9cc6Rs5N4zh3WE4HxppKkaHyuetwPLutjRqZw'),
  [FANTOM]: sdk.graph.modifyEndpoint('GVz2cRMu62ePnd3dXq42SDdTMds7koaJ1w4X5cxfdrco'),
};

const DAILY_VOLUME_FACTORY = "dayData";

const graphs = getChainVolume2({
  graphUrls: {
    [BSC]: endpoints[BSC],
    [FANTOM]: endpoints[FANTOM],
  },
  totalVolume: {
    factory: "whaleswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
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
