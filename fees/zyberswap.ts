import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
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

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  Fees: "A 0.25% of each swap is collected as trading fees",
  Revenue:
    "Protocol receives 0.1% on each swap. A part is used to buyback and burn and a part is used to buy WETH and distribute to stakers.",
  ProtocolRevenue: "Protocol receives 0.1% on each swap.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Stakers receive WETH a part of protocol revenue.",
};

const methodologyV3 = {
  UserFees: "User pays dynamic swap fee.",
  Fees: "A dynamic swap fee is collected as trading fee",
  Revenue: "Protocol receives 10% of the dynamic swap fee",
  ProtocolRevenue: "Protocol receives 10% of the dynamic swap fee",
  SupplySideRevenue: "90% of the dynamic swap fee is distributed to LPs",
  HoldersRevenue:
    "A portion of the protocol fees is used to purchase WETH and distribute to stakers.",
};

const methodologyStable = {
  UserFees: "User pays a 0.04% fee on each swap.",
  Fees: "A 0.04% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.02% of the swap fee",
  ProtocolRevenue: "Protocol receives 0.02% of the swap fee",
  SupplySideRevenue: "0.02% of the swap fee is distributed to LPs",
  HoldersRevenue:
    "A portion of the protocol fees is used to purchase WETH and distribute to stakers.",
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Graph(CHAIN.ARBITRUM),
        start: '2023-01-23',
        meta: {
          methodology,
        },
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: '2023-02-20',
        meta: {
          methodology: methodologyV3,
        },
      };
      return acc;
    }, {} as BaseAdapter),
    stable: {
      [CHAIN.ARBITRUM]: {
        fetch: stableGraph(CHAIN.ARBITRUM),
        start: '2023-02-11',
        meta: {
          methodology: methodologyStable,
        },
      },
    },
  },
};

export default adapter;
