import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, univ2Adapter } from "../../helpers/getUniSubgraphVolume";
const v3Endpoints = {
  [CHAIN.SHIMMER_EVM]: "https://shimmer.subgraph.tangleswap.space/subgraphs/name/tangleswap/shimmer-v3",
}
const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Revenue: 0
  }
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(v3Endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: v3Graphs(chain),
        start: 1696377600,
      }
    }
  }, {})
}
export default adapter;
