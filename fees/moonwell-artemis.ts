import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('DQhrdUHwspQf3hSjDtyfS6uqq9YiKoLF3Ut3U9os2HK')
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

      const dailyFee = new BigNumber(graphRes.financialsDailySnapshot?.dailyTotalRevenueUSD || 0);
      const dailyRev = new BigNumber(graphRes.financialsDailySnapshot?.dailyProtocolSideRevenueUSD || 0);

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
    [CHAIN.MOONBEAM]: {
        fetch: graphs(endpoints)(CHAIN.MOONBEAM),
        start: '2022-06-25',
    },
  }
}

export default adapter;
