import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const v3Endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint(
    "7ZP9MeeuXno2y9pWR5LzA96UtYuZYWTA4WYZDZR7ghbN",
  ),
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 10,
    HoldersRevenue: 0,
    Fees: 10,
    UserFees: 90,
    SupplySideRevenue: 90,
    Revenue: 10,
  },
});

const methodology = {
  UserFees: "User pays dynamic swap fee.",
  Fees: "A dynamic swap fee is collected as trading fee",
  Revenue: "Protocol receives 10% of the dynamic swap fee",
  ProtocolRevenue: "Protocol receives 10% of the dynamic swap fee",
  SupplySideRevenue: "90% of the dynamic swap fee is distributed to LPs",
  HoldersRevenue:
    "A portion of the protocol fees is used to purchase WETH and distribute to stakers.",
};

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: v3Graphs,
      start: '2023-02-20',
    },
  },
};

export default adapter;
