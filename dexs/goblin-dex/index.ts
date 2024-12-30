// goblin-dex
// smartbch: "https://graph.dfd.cash/subgraphs/name/goblins/subgraph-v3",
// bsc: "https://graph-bsc.goblins.cash/subgraphs/name/goblins/bsc-subgraph-v3",
// base: "https://graph-base.goblins.cash/subgraphs/name/goblins/base-subgraph-v3",
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD } from "../../helpers/getUniSubgraphFees";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints: any = {
  [CHAIN.SMARTBCH]: "https://graph.dfd.cash/subgraphs/name/goblins/subgraph-v3",
  [CHAIN.BSC]: "https://graph-bsc.goblins.cash/subgraphs/name/goblins/bsc-subgraph-v3",
  [CHAIN.BASE]: "https://graph-base.goblins.cash/subgraphs/name/goblins/base-subgraph-v3",
}


const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SMARTBCH]: {
      fetch: graphs(CHAIN.SMARTBCH),
      start: '2024-12-03',
    },
    [CHAIN.BSC]: {
      fetch: graphs(CHAIN.BSC),
      start: '2024-12-03',
    },
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: '2024-12-03',
    },
  },
};

export default adapter;
