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
  [CHAIN.BLAST]:
      "https://api.studio.thegraph.com/query/50473/v3-blast/version/latest",
  [CHAIN.MODE]:
      "https://graph.dackieswap.xyz/mode/subgraphs/name/v3-mode",
  [CHAIN.XLAYER]:
      "https://graph.dackieswap.xyz/xlayer/subgraphs/name/v3-xlayer",
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
  [CHAIN.OPTIMISM]: 1705993200,
  [CHAIN.ARBITRUM]: 1707885300,
  [CHAIN.BLAST]: 1709722800,
  [CHAIN.MODE]: 1712371653,
  [CHAIN.XLAYER]: 1712369493,
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
    [CHAIN.BLAST]: {
      fetch: v3Graph(CHAIN.BLAST),
      start: async () => v3StartTimes[CHAIN.BLAST]
    },
    [CHAIN.MODE]: {
      fetch: v3Graph(CHAIN.MODE),
      start: async () => v3StartTimes[CHAIN.MODE]
    },
    [CHAIN.XLAYER]: {
      fetch: v3Graph(CHAIN.XLAYER),
      start: async () => v3StartTimes[CHAIN.XLAYER]
    },
  },
};

export default adapter;
