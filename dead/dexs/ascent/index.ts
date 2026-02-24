import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/Ascent/ascent-subgraph",
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const endpointsV3 = {
  [CHAIN.EON]: "https://eon-graph.horizenlabs.io/subgraphs/name/surfacing8671/v3AscentFull2",

};
const graphsV3 = getChainVolume2({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
});


const adapter: BreakdownAdapter = {
  deadFrom: '2025-05-05',  // EON chain is deprecated
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.EON]: {
        fetch: graphs(CHAIN.EON),
        start: '2023-11-01'
      },
    },
    v3: {
      [CHAIN.EON]: {
        fetch: graphsV3(CHAIN.EON),
        start: '2023-11-08'
      },
    }
  }
}

export default adapter;
