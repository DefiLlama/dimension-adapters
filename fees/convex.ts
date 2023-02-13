import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/mukulmeena/convex",
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
        const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)
        console.log(dateId)

        const graphQuery = gql
        `{
          financialsDailySnapshot(id: ${dateId}) {
              dailyTotalRevenueUSD
              dailyProtocolSideRevenueUSD
          }
        }`;
  
        const graphRes = await request(graphUrls[chain], graphQuery);
  
        const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
        const dailyRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);
  
      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
        dailyHoldersRevenue: dailyRev.toString(),
      };
    }
  }
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: async ()  => 1621224000,
    }
  }
}

export default adapter;
