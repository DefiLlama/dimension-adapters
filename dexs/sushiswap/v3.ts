import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpointsV3 = {
    // [CHAIN.ARBITRUM_NOVA]: 'https://subgraphs.sushi.com/subgraphs/name/sushi-v3/v3-arbitrum-nova',
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('4vRhyrcGqN63T7FXvL9W5X72iQN8H9fDNfLcUQBG91Wi'),
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('HE31GSTGpXsRnuT4sAJoFayGBZX2xBQqWq4db48YuKmD'),
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('GtUp5iLfjfYXtX76wF1yyteSSC5WqnYV8br5ixHZgFmW'),
    [CHAIN.BOBA]: sdk.graph.modifyEndpoint('Du43Wz3rZ5ajzScgsTnuPv5NvRmQLTDPPkBxYEmFBmWM'),
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7okunX6MGm2pdFK7WJSwm9o82okpBLEzfGrqHDDMWYvq'),
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('6z2W9fLTVmhpCecSMTMpRNeSBTRPJLmKsSXrtdkpeJDz'),
    [CHAIN.FUSE]: sdk.graph.modifyEndpoint('7E265DKJJiTn8bVF1nqmBr6C2tmo5MVQFNb9sm4cxng5'),
    [CHAIN.XDAI]: sdk.graph.modifyEndpoint('hS35uHcFDVSxJQV1XWht7yMdGTRNVa9poYTpcEZ9uAQ'),
    // [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('5WabfuUgF5k4CE9snB22HNcUHQVkUStvet76qjovKdm6'),
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Hc3vTLxWmtyrn59t2Yv3MiXJVxjfNyZi41iKE3rXXHMf'),
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('G1Q6dviDfMm6hVLvCqbfeB19kLmvs7qrnBvXeFndjhaU'),
    [CHAIN.POLYGON_ZKEVM]: 'https://api.studio.thegraph.com/query/32073/v3-polygon-zkevm/v0.0.2',
    [CHAIN.THUNDERCORE]: 'https://graph-node.thundercore.com/subgraphs/name/sushi-v3/v3-thundercore',
    [CHAIN.BASE]: "https://api.studio.thegraph.com/query/32073/v3-base/v0.0.1",
    [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/sushi-v3/v3-core",
    [CHAIN.BLAST]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushiswap/v3-blast/gn",
}

const v3Graphs = getGraphDimensions({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Set revenue to 0 as protocol fee is not set for all pools for now
  }
});

const startTimeV3: {[key: string]: number} = {
    [CHAIN.ARBITRUM_NOVA]: 1680566400,
    [CHAIN.ARBITRUM]: 1680307200,
    [CHAIN.AVAX]: 1680566400,
    [CHAIN.BSC]: 1680566400,
    [CHAIN.BOBA]: 1680739200,
    [CHAIN.ETHEREUM]: 1680652800,
    [CHAIN.FANTOM]: 1680566400,
    [CHAIN.FUSE]: 1680566400,
    [CHAIN.XDAI]: 1680652800,
    [CHAIN.MOONRIVER]: 1680566400,
    [CHAIN.OPTIMISM]: 1680652800,
    [CHAIN.POLYGON]: 1680566400,
    [CHAIN.POLYGON_ZKEVM]: 1680739200,
    [CHAIN.THUNDERCORE]: 1684281600,
    [CHAIN.BASE]: 1691020800,
    [CHAIN.CORE]: 1689897600,
    [CHAIN.BLAST]: 1709337600,
}

const v3 = Object.keys(endpointsV3).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: v3Graphs(chain as Chain),
      start: startTimeV3[chain],
      meta: {
        methodology: {
          Fees: "Each pool charge between 0.01% to 1% fee",
          UserFees: "Users pay between 0.01% to 1% fee",
          Revenue: "0 to 1/4 of the fee goes to treasury",
          HoldersRevenue: "None",
          ProtocolRevenue: "Treasury receives a share of the fees",
          SupplySideRevenue: "Liquidity providers get most of the fees of all trades in their pools"
        }
      }
    },
  }),
  {}
);

export default v3
