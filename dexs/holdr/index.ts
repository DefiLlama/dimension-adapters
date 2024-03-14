import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import customBackfill from "../../helpers/customBackfill";

const endpoints: ChainEndpoints = {
  [CHAIN.AURORA]: "https://api.thegraph.com/subgraphs/name/kyzooghost/balancer_aurora_fork",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
}

const v1graphs = getChainVolume({
  graphUrls: endpoints,
  ...graphParams
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AURORA]: {
      fetch: v1graphs(CHAIN.AURORA as Chain),
      start: 1672531200,
      customBackfill: customBackfill(CHAIN.AURORA as Chain, v1graphs)
    },
  },
};

export default adapter;
