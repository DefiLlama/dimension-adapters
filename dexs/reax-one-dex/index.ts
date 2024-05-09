import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpoints: ChainEndpoints = {
  [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/subgraphs/name/reax/swaps-1",
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
  ...graphParams
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        customBackfill: customBackfill(chain as Chain, graphs),
        start: 1689638400,
      }
    }
  }, {})
};
export default adapter;
