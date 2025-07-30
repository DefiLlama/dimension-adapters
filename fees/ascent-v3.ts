import { Chain } from "../adapters/types";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD } from "../helpers/getUniSubgraphVolume";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

type IURL = {
  [l: string | Chain]: string;
};

const endpoints: IURL = {
  [CHAIN.EON]:
    "https://eon-graph.horizenlabs.io/subgraphs/name/surfacing8671/v3AscentFull2",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 32,
    UserFees: 100,
  },
});

const adapter: SimpleAdapter = {
  deadFrom: '2024-03-04',
  version: 2,
  adapter: {
    [CHAIN.EON]: {
      fetch: v3Graphs,
      start: '2023-11-08',
    },
  },
};

export default adapter;
