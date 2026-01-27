import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpointV3 = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('DZyDuvUHNThtJJQAEbYGr32xYc93BZAdfqatpYUNMZbe')
}

const v3Graphs = getGraphDimensions2({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 10,
    HoldersRevenue: 0,
    UserFees: 100,
    SupplySideRevenue: 90,
    Revenue: 10,
  }
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: v3Graphs,
      start: '2023-07-02',
    }
  }
}
export default adapters;
