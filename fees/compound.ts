import * as sdk from "@defillama/sdk";
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
    sdk.graph.modifyEndpoint('4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a')
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
            dailySupplySideRevenueUSD
            cumulativeTotalRevenueUSD
            cumulativeProtocolSideRevenueUSD
            cumulativeSupplySideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
      const dailyProtRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);
      const dailySSRev = new BigNumber(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD);
      const totalFee = new BigNumber(graphRes.financialsDailySnapshot.cumulativeTotalRevenueUSD);
      const totalProtRev = new BigNumber(graphRes.financialsDailySnapshot.cumulativeProtocolSideRevenueUSD);
      const totalSSRev = new BigNumber(graphRes.financialsDailySnapshot.cumulativeSupplySideRevenueUSD);

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: dailyProtRev.toString(),
        dailyRevenue: dailyProtRev.toString(),
        dailySupplySideRevenue: dailySSRev.toString(),
        totalFees: totalFee.toString(),
        totalProtocolRevenue: totalProtRev.toString(),
        totalRevenue: totalProtRev.toString(),
        totalSupplySideRevenue: totalSSRev.toString()
      };
    };
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: '2019-05-07',
    },
  }
}

export default adapter;
