import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.MANTLE]:
    "https://subgraph-api.mantle.xyz/api/public/346c94bd-5254-48f7-b71c-c7fa427ae0a8/subgraphs/uni-v3/v0.0.1/gn",
};

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
    Fees: 100,
    UserFees: 100,
    SupplySideRevenue: 100,  // LP gets 100% of fees
    Revenue: 0,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: v3Graphs,
      start: '2025-11-17',
    },
  },
};

export default adapter;
