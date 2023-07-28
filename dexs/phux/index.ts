import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

import { getGraphDimensions } from "../../helpers/getUniSubgraph"
const endpoints: ChainEndpoints = {
  [CHAIN.PULSECHAIN]: "https://sub.phatty.io/subgraphs/name/phux/pools-v2",
};


const graphs = getGraphDimensions({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.PULSECHAIN]: {
      "origin": "https://phux.io",
      "referer": "https://phux.io/"
    },
  },
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume"
  },
});

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () => 1686441600,
        customBackfill: customBackfill(chain, graphs),
      }
    }
  }, {})
};

export default adapter;
