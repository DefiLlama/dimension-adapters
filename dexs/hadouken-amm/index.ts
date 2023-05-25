import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import customBackfill from "../../helpers/customBackfill";

const endpoints: ChainEndpoints = {
  [CHAIN.GODWOKEN_V1]: "https://graph-multi-http-hadouken.hadouken.finance/subgraphs/name/balancer-mainnet",
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
  adapter: {
    [CHAIN.GODWOKEN_V1]: {
      fetch: v1graphs(CHAIN.GODWOKEN_V1 as Chain),
      start: async () => 1669248000,
      customBackfill: customBackfill(CHAIN.GODWOKEN_V1 as Chain, v1graphs)
    },
  },
};

export default adapter;
