import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import { BaseAdapter, BreakdownAdapter, FetchOptions, FetchResultGeneric } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { httpGet, httpPost } from '../../utils/fetchURL';
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";

const v1Endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('ESnjgAG9NjfmHypk4Huu4PVvz55fUwpyrRqHF21thoLJ'),
};

const v2Endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum'),
  [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('8vvhJXc9Fi2xpc3wXtRpYrWVYfcxThU973HhBukmFh83')
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

const v3Endpoints = {
  // [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('5AXe97hGLfjgFAc6Xvg6uDpsD5hqpxrxcma9MoxG7j7h'),
  // [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Jhu62RoQqrrWoxUUhWFkiMHDrqsTe7hTGb3NGiHPuf9'),
  // [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/id/QmZ5uwhnwsJXAQGYEF8qKPQ85iVhYAcVZcZAPfrF7ZNb9z",
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3'),
  // [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm'),
  // [CHAIN.CELO]: sdk.graph.modifyEndpoint('ESdrTJ3twMwWVoQ1hUE2u7PugEHX3QkenudD6aXCkDQ4'),
  // [CHAIN.BSC]: sdk.graph.modifyEndpoint('F85MNzUGYqgSHSHRGgeVMNsdnW1KtZSVgFULumXRZTw2'), // use oku
  // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('9EAxYE17Cc478uzFXRbM7PVnMUSsgb99XZiGxodbtpbk'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'),
  // [CHAIN.ERA]: "https://api.thegraph.com/subgraphs/name/freakyfractal/uniswap-v3-zksync-era",
  // [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('BCfy6Vw9No3weqVq9NhyGo4FkVCJep1ZN9RMJj5S32fX')
};

// fees results are in eth, needs to be converted to a balances objects
const ETH_ADDRESS = "ethereum:" + ADDRESSES.null;
const v1Graph = getGraphDimensions2({
  graphUrls: v1Endpoints,
  totalVolume: {
    factory: "uniswaps",
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

const v2Graph = getGraphDimensions2({
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

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
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
const startTimeV3: TStartTime = {
  [CHAIN.ETHEREUM]: 1620172800,
  [CHAIN.OPTIMISM]: 1636675200,
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.POLYGON]: 1640044800,
  [CHAIN.CELO]: 1657324800,
  [CHAIN.BSC]: 1678665600,
  [CHAIN.AVAX]: 1689033600,
  [CHAIN.BASE]: 1691280000,
  [CHAIN.ERA]: 1693440000
}

const chainv2mapping: any = {
  [CHAIN.ARBITRUM]: "ARBITRUM",
  [CHAIN.ETHEREUM]: "ETHEREUM",
  // [CHAIN.OPTIMISM]: "OPTIMISM",
  [CHAIN.POLYGON]: "POLYGON",
  [CHAIN.BASE]: "BASE",
  [CHAIN.BSC]: "BNB",
  [CHAIN.UNICHAIN]: "UNI"
}

async function fetchV2Volume(options: FetchOptions) {
  const { api } = options
  const endpoint = `https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ExploreStats?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22${api.chainId}%22%7D`
  const res = await httpGet(endpoint, {
    headers: {
      'accept': '*/*',
      'accept-language': 'th,en-US;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://app.uniswap.org',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://app.uniswap.org/',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  })
  const dailyVolume = res.stats.historicalProtocolVolume.Month.v2
    .find((item: any) => item.timestamp === options.startOfDay)?.value;
  return { dailyVolume, dailyFees: Number(dailyVolume) * 0.003 }
}


const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: async (_t:any, _tb: any , options: FetchOptions) => {
          const response = await v1Graph(options.chain)(options);
          const keys: any = {
            "dailyUserFees": options.createBalances(),
            "dailyProtocolRevenue": options.createBalances(),
            "dailySupplySideRevenue": options.createBalances(),
            "dailyHoldersRevenue": options.createBalances(),
            "dailyRevenue": options.createBalances(),
            "dailyFees": options.createBalances(),
          };
          for (const key of Object.keys(keys)) {
            if (typeof response[key] === 'string') {
              keys[key].add(ETH_ADDRESS, Number(response[key]) * 1e18);
            }
          }
          return response as FetchResultGeneric
        },
        start: '2018-11-03',
        meta: {
          methodology
        },
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: async (_t:any, _tb: any , options: FetchOptions) => {
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
      ...Object.keys(chainv2mapping).reduce((acc: any, chain) => {
        acc[chain] = {
          fetch: async (_t:any, _tb: any , options: FetchOptions) => fetchV2Volume(options),
        }
        return acc
      }, {})
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: async (_t:any, _tb: any , options: FetchOptions) => v3Graphs(chain as Chain)(options),
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

interface IOkuResponse {
  volume: number;
  fees: number;
}
const fetchFromOku = async (options: FetchOptions) => {
  try {
    const url = `https://omni.icarus.tools/${mappingChain(options.chain === 'era' ? 'zksync' : options.chain)}/cush/analyticsProtocolHistoric`;
    const body = {
      "params": [
        options.startTimestamp * 1000, //start
        options.endTimestamp * 1000, //end
        3600000 //interval
      ]
    }
    const response: IOkuResponse[] = (await httpPost(url, body)).result
    const dailyVolume = response.reduce((acc, item) => acc + item.volume, 0);
    const dailyFees = response.reduce((acc, item) => acc + item.fees, 0);
    return {
      dailyVolume,
      dailyFees,
    }
  } catch (e) {
    console.error(e)
    return {}
  }
}
const mappingChain = (chain: string) => {
  if (chain === CHAIN.ERA) return "zksync"
  if (chain === CHAIN.ROOTSTOCK) return "rootstock"
  if (chain === CHAIN.POLYGON_ZKEVM) return "polygon-zkevm"
  if (chain === CHAIN.XDAI) return "gnosis"
  if (chain === CHAIN.LIGHTLINK_PHOENIX) return "lightlink"
  return chain
}

// adapter.breakdown.v3[CHAIN.UNICHAIN] = {
//   fetch: async (_t:any, _tb: any , options: FetchOptions) => {
//     const adapter = getUniV3LogAdapter({ factory: "0x1F98400000000000000000000000000000000003" })
//     const response = await adapter(options)
//     return response;
//   },
//   meta: {
//     methodology
//   }
// }

adapter.breakdown.v3[CHAIN.AVAX] = {
  fetch: async (_t:any, _tb: any , options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD" })
    const response = await adapter(options)
    return response;
  },
  meta: {
    methodology
  }
}

adapter.breakdown.v3[CHAIN.WC] = {
  fetch: async (_t:any, _tb: any , options: FetchOptions) => {
    const adapter = getUniV3LogAdapter({ factory: "0x7a5028BDa40e7B173C278C5342087826455ea25a" })
    const response = await adapter(options)
    return response;
  },
  meta: {
    methodology
  }
}


const okuChains = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.ERA,
  CHAIN.SEI,
  CHAIN.UNICHAIN,
  CHAIN.SEI,
  CHAIN.TAIKO,
  CHAIN.SCROLL,
  CHAIN.ROOTSTOCK,
  CHAIN.FILECOIN,
  CHAIN.BOBA,
  CHAIN.MOONBEAM,
  CHAIN.MANTA,
  CHAIN.MANTLE,
  CHAIN.LINEA,
  CHAIN.POLYGON_ZKEVM,
  CHAIN.BLAST,
  CHAIN.XDAI,
  CHAIN.BOB,
  CHAIN.LISK,
  CHAIN.CORN,
  CHAIN.GOAT,
  CHAIN.BSC,
  CHAIN.HEMI,
  CHAIN.SAGA,
  CHAIN.XDC,
  CHAIN.LIGHTLINK_PHOENIX,
  // CHAIN.ARBITRUM,
  CHAIN.LENS,
  CHAIN.TELOS,
  CHAIN.CELO,
]



okuChains.forEach(chain => {
  adapter.breakdown.v3[chain] = {
    fetch: async (_t:any, _tb: any , options: FetchOptions) => fetchFromOku(options),
    meta: {
      methodology
    }
  }
})


export default adapter;
