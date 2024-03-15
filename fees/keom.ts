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

      const totalFee = new BigNumber(
        graphRes.financialsDailySnapshot.cumulativeTotalRevenueUSD
      );
      const dailyFee = new BigNumber(
        graphRes.financialsDailySnapshot.dailyTotalRevenueUSD
      );
      const totalRev = new BigNumber(
        graphRes.financialsDailySnapshot.cumulativeProtocolSideRevenueUSD
      );
      const dailyRev = new BigNumber(
        graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD
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
      start: 1699520408,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: graphs(endpoints)(CHAIN.POLYGON_ZKEVM),
      start: 1679921168,
    },
    [CHAIN.MANTA]: {
      fetch: graphs(endpoints)(CHAIN.MANTA),
      start: 1698838028,
    },
  },
};

export default adapter;