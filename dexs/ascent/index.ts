import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";




const endpoints = {
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/Ascent/ascent-subgraph",
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
    dateField: "date"
  },
});

const endpointsV3 = {
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/surfacing8671/v3AscentFull2",

};
const graphsV3 = getChainVolume({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: "volumeUSD",
    dateField: "date"
  },
});


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.EON]: {
        fetch: graphs(CHAIN.EON),
        start: 1698796800
      },
    },
    v3: {
      [CHAIN.EON]: {
        fetch: graphsV3(CHAIN.EON),
        start: 1699401600
      },
    }
  }
}

export default adapter;
