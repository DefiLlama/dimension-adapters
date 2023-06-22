import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"

const v3Endpoints = {
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/47443/v3-test/v0.0.3/graphql",
};

const VOLUME_USD = "volumeUSD";

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  }
});

const methodology = {
  UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: v3Graphs(CHAIN.POLYGON_ZKEVM),
      start: async () => 1679875200,
      meta: {
        methodology: {
          ...methodology,
        }
      }
    }
  }
}

export default adapter;
