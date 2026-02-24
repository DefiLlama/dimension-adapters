import * as sdk from "@defillama/sdk";
import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";

const endpoints: ChainEndpoints = {
  [CHAIN.AURORA]: sdk.graph.modifyEndpoint(
    "5Yn3qgjM8y6KnN1jZd8TjcDLPRioVpiTC46XYgEwK56S",
  ),
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
    [CHAIN.AURORA]: {
      fetch: v1graphs(CHAIN.AURORA as Chain),
      start: '2023-01-01',
    },
  },
};

export default adapter;
