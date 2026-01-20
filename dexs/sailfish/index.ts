// https://api.goldsky.com/api/public/project_cm5nst0b7iiqy01t6hxww7gao/subgraphs/sailfish-v3-occ-mainnet/1.0.0/gn

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  occ: "https://api.goldsky.com/api/public/project_cm1s79wa2tlb701tbchmeaflf/subgraphs/sailfish-v3-occ-mainnet/1.0.3/gn"
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
    UserFees: 50, // User fees are 50% of collected fees
    SupplySideRevenue: 50, // 50% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});


const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    occ: {
      fetch: v3Graphs
    },
  }
}


export default adapters;
