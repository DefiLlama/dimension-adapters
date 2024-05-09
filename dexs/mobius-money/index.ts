import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import customBackfill from "../../helpers/customBackfill";

const endpoints = {
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/d-mooers/mobius",
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
    [CHAIN.CELO]: {
      fetch: graphs(CHAIN.CELO),
      start: 1636514733,
      // customBackfill: customBackfill(CHAIN.CELO as Chain, graphs)
    },
  },
};

export default adapter;
