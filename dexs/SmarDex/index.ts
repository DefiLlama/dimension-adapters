import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const VERSION = "v0.0.7";

const endpoints = {
  [CHAIN.ETHEREUM]: `https://api.studio.thegraph.com/query/41381/smardex-volumes/${VERSION}`,
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "smardexFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "factoryDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date"
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: async () => 1678404995, // birthBlock timestamp
      meta: {
        methodology: 'Accumulated volume is calculated by summing up all the swaps on the SmarDex protocol.',
      }
    },
  },
};

export default adapter;
