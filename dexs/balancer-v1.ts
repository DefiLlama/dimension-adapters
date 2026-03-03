import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getChainVolume2 } from "../helpers/getUniSubgraphVolume";

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
};

const v1graphs = getChainVolume2({
  graphUrls: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint("93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB"),
  },
  ...graphParams,
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: v1graphs(CHAIN.ETHEREUM),
      start: '2020-02-27',
    },
  },
};

export default adapter;
