import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from  "../adapters/types";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('9JAn68UTLzUqkyXSqifMbeQH7pkHQ6hmpeuqsnSgKxLE')
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
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.MOONRIVER]: {
        fetch: graphs(endpoints)(CHAIN.MOONRIVER),
        start: '2022-02-25',
    },
  }
}

export default adapter;
