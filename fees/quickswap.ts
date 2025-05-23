import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, BaseAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const v2Endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd"),
};
const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3,
  },
});

const v3Endpoints = {
  // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.IMX]: "https://api.goldsky.com/api/public/project_clo2p14by0j082owzfjn47bag/subgraphs/quickswap-IMX/prod/gn",
};

const algebraEndpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint("FqsRcH1XqSjqVx9GRTvEJe959aCbKrcyGgDWBrUkG24g"),
  // [CHAIN.DOGECHAIN]: "https://graph-node.dogechain.dog/subgraphs/name/quickswap/dogechain-info",
  [CHAIN.POLYGON_ZKEVM]: sdk.graph.modifyEndpoint("3L5Y5brtgvzDoAFGaPs63xz27KdviCdzRuY12spLSBGU"),
  [CHAIN.SONEIUM]: sdk.graph.modifyEndpoint("3GsT6AiuDiSzh2fXbFxUKtBxT8rBEGVdQCgHSsKMPHiu")
};

const allV3Chains = {
  ...v3Endpoints,
  ...algebraEndpoints,
};

type TStartTime = {
  [s: string | Chain]: number;
};

const startTimeV3: TStartTime = {
  [CHAIN.POLYGON]: 1662425243,
  [CHAIN.POLYGON_ZKEVM]: 1679875200,
  [CHAIN.SONEIUM]: 1681559,
  [CHAIN.IMX]: 356091,
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 85, // 100% of fees are going to LPs
    Revenue: 15, // Revenue is 100% of collected fees
  },
});

const algebraGraphs = getGraphDimensions2({
  graphUrls: algebraEndpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    Fees: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 85, // 100% of fees are going to LPs
    Revenue: 15, // Revenue is 100% of collected fees
  },
});

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "A 0.3% of each swap is collected as trading fees",
  Revenue: "Protocol have no revenue",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.POLYGON]: {
        fetch: async (options: FetchOptions) => {
          try {
            const res = (await v2Graph(CHAIN.POLYGON)(options))
            if (Object.values(res).includes(NaN)) return {}
            return res
          } catch (e) {
            console.error(e)
            return {}
          }
        },
        start: '2020-10-08',
        meta: {
          methodology,
        },
      },
    },
    v3: Object.keys(allV3Chains).reduce((acc, chain) => {
      const useAlgebra = Object.keys(algebraEndpoints).includes(chain);
      acc[chain] = {
        fetch: useAlgebra
          ? algebraGraphs(chain as Chain)
          : v3Graphs(chain as Chain),
        start: startTimeV3[chain],
        meta: {
          methodology,
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
