import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { BaseAdapter, BreakdownAdapter, DISABLED_ADAPTER_KEY, FetchOptions, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph"
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9BtGwsWynjj21VyrAtNfeKG5kMhcZ7Z12T53wo7PBTLj')
};

const stablesSwapEndpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('8o2ZdXbsnHapQvT9Jh8NXLivnLSYVGQXsgVfBzfckLiW')
}

const v3Endpoint = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('8XiGZs3G3dDL3YQJx7CsMGXdn3CUBBC9CVpCe1xrsSA7')
}

const blackListedPairs = {
  [CHAIN.BSC]: [
    "0x609f59c97ddf58475c7d3f3fc829c3ff9fc4f76f"
  ]
}

const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.BSC]: {
      "origin": "https://smbswap.finance",
    },
  },
  totalVolume: {
    factory: "smbfactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25,
    ProtocolRevenue: 0.0225,
    HoldersRevenue: 0.0575,
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    Revenue: 0.08
  },
  blacklistTokens: blackListedPairs
});

const graphsStableSwap = getGraphDimensions2({
  graphUrls: stablesSwapEndpoints,
  totalVolume: {
    factory: "factories"
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

const v3Graph = getGraphDimensions2({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  totalFees:{
    factory: "factories",
  },
});

const startTimes = {
  [CHAIN.BSC]: 1676764800
} as IJSON<number>

const stableTimes = {
  [CHAIN.BSC]: 1679875200
} as IJSON<number>

const v3StartTimes = {
  [CHAIN.BSC]: 1680566400,
} as IJSON<number>

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate SELF buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.BSC]: disabledAdapter
    },
    v2: {
      [CHAIN.BSC]: {
        fetch: getUniV2LogAdapter({ factory: '0x2Af5c23798FEc8E433E11cce4A8822d95cD90565'}),
        start: startTimes[CHAIN.BSC],
        meta: {
          methodology
        }
      }
    },
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: () => ({} as any),
        start: v3StartTimes[chain],
      }
      return acc
    }, {} as BaseAdapter),
    stableswap: Object.keys(stablesSwapEndpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: () => ({} as any),
        start: stableTimes[chain],
        meta: {
          methodology : {
            UserFees: "User pays 0.25% fees on each swap.",
            ProtocolRevenue: "Treasury receives 10% of the fees.",
            SupplySideRevenue: "LPs receive 50% of the fees.",
            HoldersRevenue: "A 40% of the fees is used to facilitate SELF buyback and burn.",
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
