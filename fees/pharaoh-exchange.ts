import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NFHumrUD9wtBRnZnrvkQksZzKpic26uMM5RbZR56Gns'),
};

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 100,
    UserFees: 100,
    Revenue: 100,
    SupplySideRevenue: 0,
    ProtocolRevenue: 8,
  },
});

const methodology = {
  Fees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  start: '2023-12-12',
  chains: [CHAIN.AVAX],
  fetch: v2Graphs,
  methodology
};

export default adapter;
