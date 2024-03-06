import ADDRESSES from '../../helpers/coreAssets.json'
import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, FetchResultGeneric, BaseAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import * as sdk from "@defillama/sdk";

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"

const v1Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap",
};

const v2Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev",
};

const blacklisted = {
  [CHAIN.ETHEREUM]: [
    '0x637f415687b7b2545ef2cd8dcc1614e1cc175850',
    '0xb94acdf8662cd955f137e0c9c9fba535c87b57b4',
    '0xb504035a11e672e12a099f32b1672b9c4a78b22f',
    '0xf2a3ca198f2189263e09cd06d8a3a28a89ed1c64',
    '0x4ef66e564e89a60041eebce4716e142626c2f2f4',
    '0x62abdd605e710cc80a52062a8cc7c5d659dddbe7',
    '0x72c1f19d653c2203ef71a89cf4892ef888bc2447',
    '0xf07a660776be8cea92f8bf91fc2b482213d03f02',
    '0xf2a3ca198f2189263e09cd06d8a3a28a89ed1c64',
    '0x94799202f5f6915f2bf4535b8225c5329119ac21',
    '0x9bd01d9db5e4d30f15e17de3ec6ef055863c8be5',
    '0x0bee91533be2ede0936ea53457ce7bd9b0b398c6',
    '0x4a6ba6d30ad3ac68509c1028fd74ebe0e9b2051b',
    '0xaef4f384f460cc0039ee845671ee4955acca1603',
    '0x1010d042fe2cb7f891b4dc79a47460d0a30dc795',
    '0xe90c76ee994d09ae4c9d9d859df1f9741f5a2272',
    '0xf53f1198bbc0311b389e7f29e697ae682a73e8da',
    '0x8c8893849a700c60e90844d83d4246290e1d0188',
    '0x5d154e68155da5765285874fc9ed1ca6ce5f3a2d',
    '0x562866cd762ca778623cab07d56bc34d232d5094',
    '0x17949ab06dab7e422d8d0cc99c50f99ad4bbce82',
    '0xd4ae350a93a7e2633bf7f1035a4d044fd5d10a3b',
    '0x8c93922ba3af98c98b1f02535babdbaf6179965b',
    '0x16981398eca0f169bb55eb9c7c9380ddaab31d42',
    '0x679a2338ec9ad300e8cb6d99df5ad9a9b1711db8',
    '0x41d8287bc6289fa61fb91d0aaf440833834852ac',
    '0x82595bf4076033b54e23e10e1d763b5e14e5984b',
    '0x0fbb7d883e7c7606f1101b6c2d7b612685a05c93',
    '0x3a0888db1faa64c55f340f8be4f0e366113bf098',
    '0x98e1f56b334438e3f0bde22d92f5bfd746e0631f',
    '0xa60f3f539ce84b93cacd94f519b8e001601fd428',
    '0x5e474bcc7e64750f9aeced4e4c4b3777e8e7af37',
    '0x94d8ed37c922aa76b14793576b37b44da1f76637',
    '0x8f748aedae750cc4146e0493357778d2cf34c23f',
    '0x0008a519b43d1dd0d81e08b4d569c769524e0593',
    '0x76e222b07c53d28b89b0bac18602810fc22b49a8'
  ]
}

const KEY = 'a265c39f5a123ab2d40b25dc352adc22'

const v3Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-optmism-regen",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/id/QmZ5uwhnwsJXAQGYEF8qKPQ85iVhYAcVZcZAPfrF7ZNb9z",
  [CHAIN.POLYGON]: "https://gateway-arbitrum.network.thegraph.com/api/"+KEY+"/subgraphs/id/3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm",
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-bsc",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax",
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-base",
  [CHAIN.ERA]: "https://api.thegraph.com/subgraphs/name/freakyfractal/uniswap-v3-zksync-era"
};

const VOLUME_USD = "volumeUSD";

// fees results are in eth, needs to be converted to a balances objects
const ETH_ADDRESS = "ethereum:" + ADDRESSES.null;
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
  },
  blacklistTokens: blacklisted
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
  [CHAIN.BASE]: 1691280000,
  [CHAIN.ERA]: 1693440000
}
const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: async (options) => {
          const response = await v1Graph(options.chain)(options);
          const keys = [
            "dailyUserFees",
            "dailyProtocolRevenue",
            "dailySupplySideRevenue",
            "dailyHoldersRevenue",
            "dailyRevenue",
            "dailyFees",
          ];
          for (const key of keys) {
            if (typeof response[key] === 'string') {
              response[key] = await sdk.Balances.getUSDString({
                [ETH_ADDRESS]: response[key]
              } as any)
            }
          }
          return response as FetchResultGeneric
        },
        start: 1541203200,
        meta: {
          methodology
        },
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: async (options) => {
          const response = await v2Graph(options.chain)(options);
          response.totalVolume =
            Number(response.dailyVolume) + 1079453198606.2229;
          response.totalFees = Number(response.totalVolume) * 0.003;
          response.totalUserFees = Number(response.totalVolume) * 0.003;
          response.totalSupplySideRevenue = Number(response.totalVolume) * 0.003;
          return {
            ...response,
          }
        },
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
        start: startTimeV3[chain],
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
// adapter.breakdown.v3.bsc.fetch = async ({ endTimestamp, getEndBlock }) => {
//   const response = await v3Graphs(CHAIN.BSC)(endTimestamp, getEndBlock);
//   const totalVolume = Number(response.totalVolume) - 10_000_000_000;
//   return {
//     ...response,
//     totalVolume
//   } as FetchResultGeneric
// }

export default adapter;
