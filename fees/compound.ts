import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoint = sdk.graph.modifyEndpoint('4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a')


const fetch = async (timestamp: number, _a: any, _b: any) => {
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

  const graphRes = await request(endpoint, graphQuery);

  const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
  const dailyProtRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);
  const dailySSRev = new BigNumber(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD);

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyProtRev.toString(),
    dailyProtocolRevenue: dailyProtRev.toString(),
    dailySupplySideRevenue: dailySSRev.toString(),
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch,
        start: '2019-05-07',
    },
  }
}

export default adapter;
