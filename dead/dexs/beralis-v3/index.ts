import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.BERACHAIN]: "https://api.studio.thegraph.com/query/92670/berav3/version/latest"
}
const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 0% of collected fees
  }
});


const adapters: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-02-15',
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: v3Graphs
    },
  }
}


export default adapters;