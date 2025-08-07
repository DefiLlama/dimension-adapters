import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getStartTimestamp } from "../helpers/getStartTimestamp";

const v2Endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum'),
  [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('8vvhJXc9Fi2xpc3wXtRpYrWVYfcxThU973HhBukmFh83'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('4jGhpKjW4prWoyt5Bwk1ZHUwdEmNWveJcjEyjoTZWCY9'),
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

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    Fees: 0.3,
    UserFees: 0.3,
    Revenue: 0,
    SupplySideRevenue: 0.3,
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
  },
  blacklistTokens: blacklisted
});

const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: "Protocol have no revenue.",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue."
}

const chainv2mapping: any = {
  [CHAIN.ARBITRUM]: "ARBITRUM",
  [CHAIN.ETHEREUM]: "ETHEREUM",
  [CHAIN.POLYGON]: "POLYGON",
  [CHAIN.BSC]: "BNB",
  [CHAIN.UNICHAIN]: "UNI",
  // [CHAIN.BASE]: "BASE",
  // [CHAIN.OPTIMISM]: "OPTIMISM",
}

async function fetchV2Volume(_t:any, _tb: any , options: FetchOptions) {
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
  return { dailyVolume, dailyFees: Number(dailyVolume) * 0.003, dailyUserFees: Number(dailyVolume) * 0.003, dailySupplySideRevenue: Number(dailyVolume) * 0.003, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0 }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (_t:any, _tb: any , options: FetchOptions) => {
        const response = await v2Graph(options);
        response.totalVolume =
          Number(response.dailyVolume) + 1079453198606.2229;
        response.totalFees = Number(response.totalVolume) * 0.003;
        response.totalUserFees = Number(response.totalVolume) * 0.003;
        response.totalSupplySideRevenue = Number(response.totalVolume) * 0.003;
        return {
          ...response,
          dailyUserFees: response.dailyFees,
        }
      },
      start: getStartTimestamp({
        endpoints: v2Endpoints,
        chain: CHAIN.ETHEREUM,
      }),
    },
    [CHAIN.BASE]: {
      fetch: async (_t:any, _tb: any , options: FetchOptions) => {
        const response = await v2Graph(options);
        response.totalFees = Number(response.dailyVolume) * 0.003;
        response.totalUserFees = Number(response.dailyVolume) * 0.003;
        response.totalSupplySideRevenue = Number(response.dailyVolume) * 0.003;
        return {
          ...response,
          dailyUserFees: response.dailyFees,
        }
      },
      start: getStartTimestamp({
        endpoints: v2Endpoints,
        chain: CHAIN.BASE,
      }),
    },
    ...Object.keys(chainv2mapping).reduce((acc: any, chain) => {
      acc[chain] = {
        fetch: fetchV2Volume,
      }
      return acc
    }, {})
  }
}

export default adapter
