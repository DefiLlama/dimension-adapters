import { Chain } from "@defillama/sdk/build/general";
import request from "graphql-request";
import { BaseAdapter, BreakdownAdapter, DISABLED_ADAPTER_KEY, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

import { getGraphDimensions } from "../../helpers/getUniSubgraph"

const endpoints = {
  [CHAIN.BSC]: "https://proxy-worker.pancake-swap.workers.dev/bsc-exchange",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exhange-eth"
};

const stablesSwapEndpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-stableswap"
}

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.BSC]: {
      "origin": "https://pancakeswap.finance",
    },
  },
  totalVolume: {
    factory: "pancakeFactories"
  },
  dailyVolume: {
    factory: "pancakeDayData"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25,
    ProtocolRevenue: 0.0225,
    HoldersRevenue: 0.0575,
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    Revenue: 0.0225// 0.25
  }
});

const graphsStableSwap = getGraphDimensions({
  graphUrls: stablesSwapEndpoints,
  totalVolume: {
    factory: "pancakeFactories"
  },
  dailyVolume: {
    factory: "pancakeDayData"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25, // 0.25% volume
    ProtocolRevenue: 0.025, // 10% fees
    HoldersRevenue: 0.1, // 40% fees
    UserFees: 0.25, // 25% volume
    SupplySideRevenue: 0.125, // 50% fees
    Revenue: 0.0225 // 50% fees
  }
});

const startTimes = {
  [CHAIN.ETHEREUM]: 1664236800,
  [CHAIN.BSC]: 1619136000
} as IJSON<number>

const stableTimes = {
  [CHAIN.BSC]: 1663718400
} as IJSON<number>

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate CAKE buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter
    },
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphs(chain as Chain),
        start: async () => startTimes[chain],
        meta: {
          methodology
        }
      }
      return acc
    }, {} as BaseAdapter),
    stableswap: Object.keys(stablesSwapEndpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphsStableSwap(chain as Chain),
        start: async () => stableTimes[chain],
        meta: {
          methodology : {
            UserFees: "User pays 0.25% fees on each swap.",
            ProtocolRevenue: "Treasury receives 10% of the fees.",
            SupplySideRevenue: "LPs receive 50% of the fees.",
            HoldersRevenue: "A 40% of the fees is used to facilitate CAKE buyback and burn.",
            Revenue: "Revenue is 50% of the fees paid by users.",
            Fees: "All fees comes from the user fees, which is 025% of each trade."
          }
        }
      }
      return acc
    }, {} as BaseAdapter),
  },
};

export default adapter;
