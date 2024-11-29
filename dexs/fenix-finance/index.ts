import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BLAST]:
    "https://api.goldsky.com/api/public/project_clxadvm41bujy01ui2qalezdn/subgraphs/fenix-v2-subgraph/0.0.1/gn",
};


const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date",
  },
  hasDailyVolume: true,
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BLAST]: {
      fetch: graphs(CHAIN.BLAST),
    },
  },
};

export default adapter;

