import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/50473/exchange-clmm/version/latest",
  [CHAIN.OPTIMISM]:
    "https://api.studio.thegraph.com/query/50473/v3-optimism/version/latest",
  [CHAIN.ARBITRUM]:
      "https://api.studio.thegraph.com/query/50473/v3-arbitrum/version/latest",
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
  totalFees:{
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD"
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 1691712000,
  [CHAIN.OPTIMISM]: 1705993200,
  [CHAIN.ARBITRUM]: 1707928837,
} as IJSON<number>;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: v3Graph(CHAIN.BASE),
      start: async () => v3StartTimes[CHAIN.BASE]
    },
    [CHAIN.OPTIMISM]: {
      fetch: v3Graph(CHAIN.OPTIMISM),
      start: async () => v3StartTimes[CHAIN.OPTIMISM]
    },
    [CHAIN.ARBITRUM]: {
      fetch: v3Graph(CHAIN.ARBITRUM),
      start: async () => v3StartTimes[CHAIN.ARBITRUM]
    },
  },
};

export default adapter;
