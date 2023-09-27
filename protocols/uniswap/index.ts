import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, FetchResultGeneric, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"
import { type } from "os";

const v1Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap",
};

const v2Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev",
};

const v3Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis?source=uniswap",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-arbitrum-one",
  [CHAIN.POLYGON]:
    "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon",
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-bsc",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax",
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-base"
};

const VOLUME_USD = "volumeUSD";

// fees results are in eth, needs to be converted to a balances objects
const ETH_ADDRESS = "ethereum:0x0000000000000000000000000000000000000000";
const v1Graph = getGraphDimensions({
  graphUrls: v1Endpoints,
  totalVolume: {
    factory: "uniswaps",
  },
  dailyVolume: {
    field: "dailyVolumeInUSD",
  },
  dailyFees: {
    factory: "exchangeHistoricalData",
    field: "feeInEth"
  },
  feesPercent: {
    type: "fees",
    UserFees: 100,
    ProtocolRevenue: 0,
    SupplySideRevenue: 100,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 100
  }
});

const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3
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
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue."
}

type TStartTime = {
  [key: string]: number;
}
const startTimeV3:TStartTime = {
  [CHAIN.ETHEREUM]:  1620172800,
  [CHAIN.OPTIMISM]:  1636675200,
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.POLYGON]:  1640044800,
  [CHAIN.CELO]: 1657324800,
  [CHAIN.BSC]: 1678665600,
  [CHAIN.AVAX]: 1689033600,
  [CHAIN.BASE]: 1691280000
}
const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: async (timestamp, chainBlocks) => {
          const response = await v1Graph(CHAIN.ETHEREUM)(timestamp, chainBlocks)
          return {
            ...response,
            ...["dailyUserFees", "dailyProtocolRevenue", "dailySupplySideRevenue", "dailyHoldersRevenue", "dailyRevenue", "dailyFees"].reduce((acc, resultType) => {
              const valueInEth = response[resultType]
              if (typeof valueInEth === 'string')
                acc[resultType] = {
                  [ETH_ADDRESS]: valueInEth
                }
              return acc
            }, {} as FetchResultGeneric)
          } as FetchResultGeneric
        },
        start: async () => 1541203200,
        meta: {
          methodology
        },
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: v2Graph(CHAIN.ETHEREUM),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: CHAIN.ETHEREUM,
        }),
        meta: {
          methodology
        },
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: async () => startTimeV3[chain],
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays 0.05%, 0.30%, or 1% on each swap."
          }
        }
      }
      return acc
    }, {} as BaseAdapter)
  }
}

export default adapter;
