import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const endpoints: ChainEndpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/beethovenxfi/beethovenx",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/beethovenxfi/beethovenx-optimism",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
}

const graphs = getChainVolume({
  graphUrls: endpoints,
  ...graphParams,
});

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () => 1633392000,
        customBackfill: customBackfill(chain, graphs),
      }
    }
  }, {})
};

export default adapter;
