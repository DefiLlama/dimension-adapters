import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { FetchOptions } from "../../adapters/types";

const endpointsV3 = {
    [CHAIN.ARBITRUM_NOVA]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushi-v3/v3-arbitrum-nova/gn",
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('4vRhyrcGqN63T7FXvL9W5X72iQN8H9fDNfLcUQBG91Wi'),
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('HE31GSTGpXsRnuT4sAJoFayGBZX2xBQqWq4db48YuKmD'),
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('FiJDXMFCBv88GP17g2TtPh8BcA8jZozn5WRW7hCN7cUT'),
    [CHAIN.BOBA]: sdk.graph.modifyEndpoint('Du43Wz3rZ5ajzScgsTnuPv5NvRmQLTDPPkBxYEmFBmWM'),
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7okunX6MGm2pdFK7WJSwm9o82okpBLEzfGrqHDDMWYvq'),
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('6z2W9fLTVmhpCecSMTMpRNeSBTRPJLmKsSXrtdkpeJDz'),
    [CHAIN.FUSE]: sdk.graph.modifyEndpoint('7E265DKJJiTn8bVF1nqmBr6C2tmo5MVQFNb9sm4cxng5'),
    [CHAIN.XDAI]: sdk.graph.modifyEndpoint('GFvGfWBX47RNnvgwL6SjAAf2mrqrPxF91eA53F4eNegW'),
    // [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('F46W9YVQXGism5iN9NZNhKm2DQCvjhr4u847rL1tRebS'),
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Hc3vTLxWmtyrn59t2Yv3MiXJVxjfNyZi41iKE3rXXHMf'),
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('G1Q6dviDfMm6hVLvCqbfeB19kLmvs7qrnBvXeFndjhaU'),
    // [CHAIN.POLYGON_ZKEVM]: sdk.graph.modifyEndpoint('E2x2gmtYdm2HX3QXorUBY4KegfGu79Za6TEQYjVrx15c'),
    // [CHAIN.THUNDERCORE]: 'https://graph-node.thundercore.com/subgraphs/name/sushi-v3/v3-thundercore',
    [CHAIN.BASE]: sdk.graph.modifyEndpoint('Cz4Snpih41NNNPZcbj1gd3fYXPwFr5q92iWMoZjCarEb'),
    [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/sushi-v3/v3-core",
    [CHAIN.BLAST]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushiswap/v3-blast/gn",
    [CHAIN.ROOTSTOCK]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushiswap/v3-rootstock-2/gn",
    [CHAIN.BITTORRENT]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushi-v3/v3-bttc/gn",
    // [CHAIN.FILECOIN]: "https://sushi.laconic.com/subgraphs/name/sushiswap/v3-filecoin",
    [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/api/public/fc1ae952-7a36-44ac-9e9b-f46d70cedf7d/subgraphs/sushi-v3/v3-metis/v0.0.1/gn",
    [CHAIN.KAVA]: "https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushi-v3/v3-kava/gn",
    // [CHAIN.ZETA]: "https://api.goldsky.com/api/public/project_cls39ugcfyhbq01xl9tsf6g38/subgraphs/v3-zetachain/1.0.0/gn",
    // [CHAIN.HAQQ]: "https://haqq.graph.p2p.org/subgraphs/name/sushi/v3-haqq-2",
    [CHAIN.LINEA]: sdk.graph.modifyEndpoint('E2vqqvSzDdUiPP1r7PFnPKZQ34pAhNZjc6rEcdj3uE5t'),
    [CHAIN.SCROLL]: sdk.graph.modifyEndpoint('5gyhoHx768oHn3GxsHsEc7oKFMPFg9AH8ud1dY8EirRc'),
    // [CHAIN.SKALE_EUROPA]: "https://elated-tan-skat-graph.skalenodes.com:8000/subgraphs/name/sushi/v3-skale-europa",
    [CHAIN.SONIC]: sdk.graph.modifyEndpoint('5ijXw9MafwFkXgoHmUiWsWHvRyYAL3RD4smnmBLmNPnw'),
    [CHAIN.HEMI]: sdk.graph.modifyEndpoint('GQU44ZBv8NpiBUxA6eLSDSdd7bs6TVop9dASKzrdirUv'),
}

const v3Graphs = getGraphDimensions2({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
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
    [CHAIN.ROOTSTOCK]: 1709337600,
    [CHAIN.BITTORRENT]: 1711982400,
    [CHAIN.FILECOIN]: 1711982400,
    [CHAIN.METIS]: 1711982400,
    [CHAIN.KAVA]: 1711982400,
    [CHAIN.ZETA]: 1711982400,
    [CHAIN.HAQQ]: 1711982400,
    [CHAIN.LINEA]: 1711982400,
    [CHAIN.SCROLL]: 1711982400,
    [CHAIN.SKALE_EUROPA]: 1711982400,
    [CHAIN.SONIC]: 1711982400,
}

const v3 = Object.keys(endpointsV3).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: async (options: FetchOptions) => {
        const res = (await v3Graphs(chain as Chain)(options))
        const result = {
          totalVolume: res.totalVolume,
          dailyVolume: res.dailyVolume,
          totalFees: res.totalFees,
          totalUserFees: res.totalUserFees,
          dailyFees: res.dailyFees,
          dailyUserFees: res.dailyUserFees0
        };

        Object.entries(result).forEach(([key, value]) => {
          if (Number(value) < 0) throw new Error(`${key} cannot be negative. Current value: ${value}`);
        });

        return result;
      },
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
