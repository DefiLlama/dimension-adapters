import { SimpleAdapter } from "../../adapters/types";
import { BOBA } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [BOBA]:
    "https://thegraph.com/hosted-service/subgraph/koyo-finance/exchange-subgraph-boba",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "koyos",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
});

const adapter: SimpleAdapter = {
  adapter: {
    [BOBA]: {
      fetch: graphs(BOBA),
      start: async () => 1655104044,
      customBackfill: undefined,
    },
  },
};

export default adapter;
