import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/lido-ethereum",
}

const graphs = (graphUrls: ChainEndpoints) => {
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


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: async ()  => 1608354000,
    },
  }
}

export default adapter;
