import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, univ2Adapter } from "../../helpers/getUniSubgraphVolume";
const v3Endpoints = {
  [CHAIN.SHIMMER_EVM]: "https://graph-c.shimmersea.finance/subgraphs/name/shimmersea/shimmer-dex",
}
const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: "dailyVolumeUSD",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.15,
    HoldersRevenue: 0.075,
    Revenue: 0.075,
    Fees: 0.3
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
