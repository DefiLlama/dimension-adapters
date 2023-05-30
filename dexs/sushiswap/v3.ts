import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpointsV3 = {
    [CHAIN.ARBITRUM_NOVA]: 'https://subgraphs.sushi.com/subgraphs/name/sushi-v3/v3-arbitrum-nova',
    [CHAIN.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-arbitrum',
    [CHAIN.AVAX]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-avalanche',
    [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-bsc',
    [CHAIN.BOBA]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-boba',
    [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-ethereum',
    [CHAIN.FANTOM]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-fantom',
    [CHAIN.FUSE]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-fuse',
    [CHAIN.XDAI]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-gnosis',
    [CHAIN.MOONRIVER]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-moonriver',
    [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-optimism',
    [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-polygon',
    [CHAIN.POLYGON_ZKEVM]: 'https://api.studio.thegraph.com/query/32073/v3-polygon-zkevm/v0.0.2',
    [CHAIN.THUNDERCORE]: 'https://graph-node.thundercore.com/subgraphs/name/sushi-v3/v3-thundercore',
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
    [CHAIN.ARBITRUM_NOVA]: 4242300,
    [CHAIN.ARBITRUM]: 75998697,
    [CHAIN.AVAX]: 28186391,
    [CHAIN.BSC]: 26976538,
    [CHAIN.BOBA]: 998556,
    [CHAIN.ETHEREUM]: 16955547,
    [CHAIN.FANTOM]: 58860670,
    [CHAIN.FUSE]: 22556035,
    [CHAIN.XDAI]: 27232871,
    [CHAIN.MOONRIVER]: 3945310,
    [CHAIN.OPTIMISM]: 85432013,
    [CHAIN.POLYGON]: 41024971,
    [CHAIN.POLYGON_ZKEVM]: 80860,
    [CHAIN.THUNDERCORE]: 132536332
}

const v3 = Object.keys(endpointsV3).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: v3Graphs(chain as Chain),
      start: async () => startTimeV3[chain],
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
