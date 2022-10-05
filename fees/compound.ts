import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks } from "../adapters/types";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/messari/compound-ethereum"
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
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
      const dailyRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);

      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: async ()  => 1557201600,
    },
  }
}

export default adapter;
