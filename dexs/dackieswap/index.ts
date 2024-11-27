import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/50473/v3-base/version/latest",
  [CHAIN.OPTIMISM]:
    "https://api.studio.thegraph.com/query/50473/v3-optimism/version/latest",
  [CHAIN.ARBITRUM]:
      "https://api.studio.thegraph.com/query/50473/v3-arbitrum/version/latest",
  [CHAIN.BLAST]:
      "https://api.studio.thegraph.com/query/50473/v3-blast/version/latest",
  [CHAIN.MODE]:
      "https://api.studio.thegraph.com/query/50473/v3-mode/version/latest",
  [CHAIN.XLAYER]:
      "https://api.studio.thegraph.com/query/50473/v3-xlayer/version/latest",
  [CHAIN.LINEA]:
      "https://api.studio.thegraph.com/query/50473/v3-linea/version/latest",
};

const v3Graph = getGraphDimensions2({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 1691712000,
  [CHAIN.OPTIMISM]: 1705993200,
  [CHAIN.ARBITRUM]: 1707885300,
  [CHAIN.BLAST]: 1722556800,
  [CHAIN.MODE]: 1712371653,
  [CHAIN.XLAYER]: 1712369493,
  [CHAIN.LINEA]: 1725062400,
} as IJSON<number>;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: v3Graph(CHAIN.BASE),
      start: v3StartTimes[CHAIN.BASE]
    },
    [CHAIN.OPTIMISM]: {
      fetch: v3Graph(CHAIN.OPTIMISM),
      start: v3StartTimes[CHAIN.OPTIMISM]
    },
    [CHAIN.ARBITRUM]: {
      fetch: v3Graph(CHAIN.ARBITRUM),
      start: v3StartTimes[CHAIN.ARBITRUM]
    },
    [CHAIN.BLAST]: {
      fetch: v3Graph(CHAIN.BLAST),
      start: v3StartTimes[CHAIN.BLAST]
    },
    [CHAIN.MODE]: {
      fetch: v3Graph(CHAIN.MODE),
      start: v3StartTimes[CHAIN.MODE]
    },
    [CHAIN.XLAYER]: {
      fetch: v3Graph(CHAIN.XLAYER),
      start: v3StartTimes[CHAIN.XLAYER]
    },
    [CHAIN.LINEA]: {
      fetch: v3Graph(CHAIN.LINEA),
      start: v3StartTimes[CHAIN.LINEA]
    },
  },
  version: 2
};

export default adapter;
