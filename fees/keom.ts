import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.POLYGON]:
    "https://api.studio.thegraph.com/query/39380/staging-keom-pos/version/latest",
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/39380/staging-keom-zkevm/version/latest",
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_clqpd6naegn6301uu9h0gd8qz/subgraphs/keom-subgraph/1.0.0/gn",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400);

      const graphQuery = gql`{
        financialsDailySnapshot(id: ${dateId}) {
            cumulativeTotalRevenueUSD
            dailyTotalRevenueUSD
            cumulativeProtocolSideRevenueUSD
            dailyProtocolSideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const totalFee = Number(
        graphRes.financialsDailySnapshot?.cumulativeTotalRevenueUSD || '0'
      );
      const dailyFee = Number(
        graphRes.financialsDailySnapshot?.dailyTotalRevenueUSD || '0'
      );
      const totalRev = Number(
        graphRes.financialsDailySnapshot?.cumulativeProtocolSideRevenueUSD || '0'
      );
      const dailyRev = Number(
        graphRes.financialsDailySnapshot?.dailyProtocolSideRevenueUSD || '0'
      );

      return {
        timestamp,
        totalFees: totalFee.toString(),
        dailyFees: dailyFee.toString(),
        totalRevenue: totalRev.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: graphs(endpoints)(CHAIN.POLYGON),
      start: '2023-11-09',
    },
    // [CHAIN.POLYGON_ZKEVM]: {
    //   fetch: graphs(endpoints)(CHAIN.POLYGON_ZKEVM), // error the graph is not available
    //   start: '2023-03-27',
    // },
    [CHAIN.MANTA]: {
      fetch: graphs(endpoints)(CHAIN.MANTA),
      start: '2023-11-01',
    },
  },
};

export default adapter;
