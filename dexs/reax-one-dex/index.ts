import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";

const endpoints: ChainEndpoints = {
  [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/subgraphs/name/reax/swaps-1",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
}


const graphs = getChainVolume2({
  graphUrls: endpoints,
  ...graphParams
});

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2024-10-08',
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: '2023-07-18',
      }
    }
  }, {})
};
export default adapter;
