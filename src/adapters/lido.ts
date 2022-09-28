import { FeeAdapter } from "../utils/adapters.type";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { IGraphUrls } from "../helpers/graphs.type";
import { Chain } from "../utils/constants";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/lido-ethereum",
}

const graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

      const graphQuery = gql
      `{
        financialsDailySnapshot(id: ${dateId}) {
            dailyTotalRevenueUSD
            dailyProtocolSideRevenueUSD
            cumulativeTotalRevenueUSD
            cumulativeProtocolSideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
      const totalFee = new BigNumber(graphRes.financialsDailySnapshot.cumulativeTotalRevenueUSD);
      const dailyRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);
      const totalRev = new BigNumber(graphRes.financialsDailySnapshot.cumulativeProtocolSideRevenueUSD);

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


const adapter: FeeAdapter = {
  fees: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: 1608354000,
    },
  }
}

export default adapter;
