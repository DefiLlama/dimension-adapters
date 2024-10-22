import { BreakdownAdapter } from "../../adapters/types";
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
const endpointsAlgebraV3 = {
  [CHAIN.BLAST]:
    "https://api.goldsky.com/api/public/project_clxadvm41bujy01ui2qalezdn/subgraphs/fenix-v3-dex/ce3738b/gn",
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
const graphsAlgebraV3 = getChainVolume({
  graphUrls: endpointsAlgebraV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date",
  },
});

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v2: {
      [CHAIN.BLAST]: {
        fetch: graphs(CHAIN.BLAST),
        start: 1596021,
      },
    },
    v3: {
      [CHAIN.BLAST]: {
        fetch: graphsAlgebraV3(CHAIN.BLAST),
        start: 1596025,
      },
     
    },
   
  },
};

export default adapter;

