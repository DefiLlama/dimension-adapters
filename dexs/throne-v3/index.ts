import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/somberload/throne-exchange-v3",
};

const VOLUME_USD = "volumeUSD";

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD,
  },
  totalFees: {
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD",
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 1691712000,
} as IJSON<number>;

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: v3Graph(CHAIN.BASE),
      start: v3StartTimes[CHAIN.BASE]
    },
  },
};

export default adapter;
