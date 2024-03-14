import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"

const v2Endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/hekman-eth/arbidex",
};

const v3Endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/hekman-eth/arbidex-v3",
};

const VOLUME_USD = "volumeUSD";

const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.05,
    HoldersRevenue: 0.2,
    Revenue: 0,
    Fees: 0.25
  }
});

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 100,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 0, // 0% of fees are going to LPs
    Revenue: 0 // Revenue is 0% of collected fees
  }
});

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "No protocol revenue.",
  SupplySideRevenue: "LPs have no revenue.",
  HoldersRevenue: "ARX stakers receive all fees."
}

type TStartTime = {
  [key: string]: number;
}
const startTimeV3:TStartTime = {
  [CHAIN.ARBITRUM]: 1683590400,
}
const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Graph(CHAIN.ARBITRUM),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: CHAIN.ARBITRUM,
        }),
        meta: {
          methodology
        },
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: startTimeV3[chain],
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%."
          }
        }
      }
      return acc
    }, {} as BaseAdapter)
  }
}

export default adapter;
