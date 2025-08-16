import * as sdk from "@defillama/sdk";
import { BreakdownAdapter, BaseAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint(
    "3g83GYhbyHtjy581vpTmN1AP9cB9MjWMh5TiuNpvTU4R",
  ),
};
const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    ProtocolRevenue: 0.1,
    SupplySideRevenue: 0.15,
    HoldersRevenue: 0,
    Revenue: 0.1,
    Fees: 0.25,
  },
});

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
    UserFees: 90, // User fees are 90% of collected fees
    SupplySideRevenue: 90, // 90% of fees are going to LPs
    Revenue: 10, // Revenue is 10% of collected fees
  },
});

const endpointsStable = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint(
    "H7QEsa69B3bbXZVtmqGaRZVUV8PCUqsKfqXGRb69LHa6",
  ),
};

const stableGraph = getGraphDimensions2({
  graphUrls: endpointsStable,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.04,
    ProtocolRevenue: 0.02,
    SupplySideRevenue: 0.02,
    HoldersRevenue: 0,
    Revenue: 0.02,
    Fees: 0.04,
  },
});


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Graph,
        start: '2023-01-23',
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs,
        start: '2023-02-20',
      };
      return acc;
    }, {} as BaseAdapter),
    stable: {
      [CHAIN.ARBITRUM]: {
        fetch: stableGraph,
        start: '2023-02-11',
s      },
    },
  },
};

export default adapter;
