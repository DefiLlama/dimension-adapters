import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/ferro/swap",
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: graphs(CHAIN.CRONOS),
      start: '2022-08-29',
    },
  },
};

export default adapter;
