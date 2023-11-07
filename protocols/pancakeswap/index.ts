import { Chain } from "@defillama/sdk/build/general";
import { BaseAdapter, BreakdownAdapter, DISABLED_ADAPTER_KEY, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

import { getGraphDimensions } from "../../helpers/getUniSubgraph"

const endpoints = {
  [CHAIN.BSC]: "https://proxy-worker.pancake-swap.workers.dev/bsc-exchange",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exhange-eth",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/45376/exchange-v2-polygon-zkevm/version/latest",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45376/exchange-v2-zksync/version/latest",
  [CHAIN.ARBITRUM]: "https://api.studio.thegraph.com/query/45376/exchange-v2-arbitrum/version/latest",
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/pancakeswap/exhange-v2",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/45376/exchange-v2-base/version/latest",
  [CHAIN.OP_BNB]: "https://opbnb-mainnet-graph.nodereal.io/subgraphs/name/pancakeswap/exchange-v2"
};

const stablesSwapEndpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-stableswap"
}

const v3Endpoint = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-eth",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest",
  [CHAIN.ARBITRUM]: "https://api.studio.thegraph.com/query/45376/exchange-v3-arbitrum/version/latest",
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/pancakeswap/exchange-v3-linea",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/45376/exchange-v3-base/version/latest",
  [CHAIN.OP_BNB]: "https://opbnb-mainnet-graph.nodereal.io/subgraphs/name/pancakeswap/exchange-v3"
}

const VOLUME_USD = "volumeUSD";

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
    Revenue: 0.08
  }
});

const graphsStableSwap = getGraphDimensions({
  graphUrls: stablesSwapEndpoints,
  totalVolume: {
    factory: "factories"
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

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",

  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD
  },
  totalFees:{
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD"
  },
});

const startTimes = {
  [CHAIN.ETHEREUM]: 1664236800,
  [CHAIN.BSC]: 1619136000,
  [CHAIN.POLYGON_ZKEVM]: 1687910400,
  [CHAIN.ERA]: 1690156800,
  [CHAIN.ARBITRUM]: 1691452800,
  [CHAIN.LINEA]: 1692835200,
  [CHAIN.BASE]: 1693440000,
  [CHAIN.OP_BNB]: 1695081600
} as IJSON<number>

const stableTimes = {
  [CHAIN.BSC]: 1663718400
} as IJSON<number>

const v3StartTimes = {
  [CHAIN.BSC]: 1680307200,
  [CHAIN.ETHEREUM]: 1680307200,
  [CHAIN.POLYGON_ZKEVM]: 1686182400,
  [CHAIN.ERA]: 1690156800,
  [CHAIN.ARBITRUM]: 1691452800,
  [CHAIN.LINEA]: 1692835200,
  [CHAIN.BASE]: 1692576000,
  [CHAIN.OP_BNB]: 1693440000
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
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.BSC]: {
        fetch: async (timestamp: number) => {
          const totalVolume = 1033944000;
          return {
            totalVolume: `${totalVolume}`,
            timestamp: timestamp
          }
        },
        start: async () => 1680307200,
      }
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
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graph(chain as Chain),
        start: async () => v3StartTimes[chain],
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
