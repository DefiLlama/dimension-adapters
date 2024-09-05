import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import customBackfill from "../../helpers/customBackfill";

const endpoints: ChainEndpoints = {
  [CHAIN.GODWOKEN_V1]:
    "https://graph-prod-http-hadouken-prod.hadouken.finance/subgraphs/name/balancer-godwoken-mainnet",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
};

const v1graphs = getChainVolume2({
  graphUrls: endpoints,
  ...graphParams,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.GODWOKEN_V1]: {
      fetch: v1graphs(CHAIN.GODWOKEN_V1 as Chain),
      start: 1669248000,
      customBackfill: customBackfill(CHAIN.GODWOKEN_V1 as Chain, v1graphs),
    },
  },
};

export default adapter;
