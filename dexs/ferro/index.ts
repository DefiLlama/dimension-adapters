import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";


const endpoints = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/ferro/swap",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: graphs(CHAIN.CRONOS),
      start: 1661731973,
    },
  },
};

export default adapter;
