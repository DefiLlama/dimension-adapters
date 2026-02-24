import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../adapters/types";
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

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  Fees: "A 0.25% of each swap is collected as trading fees",
  Revenue:
    "Protocol receives 0.1% on each swap. A part is used to buyback and burn and a part is used to buy WETH and distribute to stakers.",
  ProtocolRevenue: "Protocol receives 0.1% on each swap.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Stakers receive WETH a part of protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: v2Graph,
      start: '2023-01-23',
      meta: { methodology },
    },
  },
};

export default adapter;
