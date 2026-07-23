import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('9JAn68UTLzUqkyXSqifMbeQH7pkHQ6hmpeuqsnSgKxLE')
}


const fetch = async (options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.toTimestamp) / 86400)

  const graphQuery = gql
    `{
      financialsDailySnapshot(id: ${dateId}) {
          dailyTotalRevenueUSD
          dailyProtocolSideRevenueUSD
      }
    }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
  const dailyRev = new BigNumber(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD);

  return {
    dailyFees: dailyFee.toString(),
    dailyRevenue: dailyRev.toString(),
  };
};


const adapter: Adapter = {
  fetch,
  chains: [CHAIN.MOONRIVER],
  start: '2022-02-25',
}

export default adapter;
