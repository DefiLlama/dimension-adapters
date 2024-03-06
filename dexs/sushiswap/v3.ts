import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { Adapter, SimpleAdapter } from "../../adapters/types";

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
    // [CHAIN.MOONRIVER]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-moonriver',
    [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-optimism',
    [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/sushi-v3/v3-polygon',
    [CHAIN.POLYGON_ZKEVM]: 'https://api.studio.thegraph.com/query/32073/v3-polygon-zkevm/v0.0.2',
    [CHAIN.THUNDERCORE]: 'https://graph-node.thundercore.com/subgraphs/name/sushi-v3/v3-thundercore',
    [CHAIN.BASE]: "https://api.studio.thegraph.com/query/32073/v3-base/v0.0.1"
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
