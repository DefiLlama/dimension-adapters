import customBackfill from "../../helpers/customBackfill";
import {
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
} from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import type { BaseAdapter, BreakdownAdapter, ChainEndpoints } from "../../adapters/types";
import type { Chain } from "@defillama/sdk/build/general";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const v2Endpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/harleen-m/baseswap",
};
const v3Endpoints = {
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/baseswapfi/v3-base",
};

// Fetch function to query the subgraphs
const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    ProtocolRevenue: 0.08,
    Revenue: 0.25,
    Fees: 0.25,
  },
});

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 64,
    UserFees: 100,
    SupplySideRevenue: 36,
    Revenue: 0,
  },
});

const v2Methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.17% of each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees come from the user.",
};

const v3Methodology = {
  UserFees:
    "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
  SupplySideRevenue: "LPs receive 36% of the current swap fee",
  ProtocolRevenue: "Treasury receives 64% of each swap",
  Fees: "All fees come from the user.",
};

const startTimeV3 = {
  [CHAIN.BASE]: 1693150193,
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: Object.keys(v2Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: v2Graph(chain as Chain),
          start: 1690495200,
          customBackfill: customBackfill(chain, v2Graph),
          meta: { methodology: v2Methodology },
        },
      };
    }, {}),
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: startTimeV3[chain],
        meta: {
          methodology: v3Methodology,
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
