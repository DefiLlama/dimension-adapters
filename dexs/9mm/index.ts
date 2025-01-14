import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.PULSECHAIN]:
    "https://graph.9mm.pro/subgraphs/name/pulsechain/9mm-v3",
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/80328/9mmbasev3/version/latest",
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
  [CHAIN.PULSECHAIN]: 1701128040,
  [CHAIN.BASE]: 1718318340,
  
} as IJSON<number>;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: v3Graph(CHAIN.BASE),
      start: v3StartTimes[CHAIN.BASE]
    },
    [CHAIN.PULSECHAIN]: {
      fetch: v3Graph(CHAIN.PULSECHAIN),
      start: v3StartTimes[CHAIN.PULSECHAIN]
    },
  },
  version: 2
};

export default adapter;