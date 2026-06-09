import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('CvqFU9sqzqpdNJMyJri2J9LjUjkzdjQZDGwdvzf1naXH'),
}


const methodology = {
  Fees: "Fees from open/close position, swap, mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees: "Fees from open/close position, swap and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to COVO stakers",
  SupplySideRevenue: "70% of all collected fees goes to COVOLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to COVO stakers",
  ProtocolRevenue: "Treasury has no revenue"
}

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp)
  const searchTimestamp = todaysTimestamp
  let dailyFee = 0;
  let finalDailyFee = 0;
  let userFee = 0;
  let finalUserFee = 0;

  const graphQuery = gql
    `{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  if (graphRes.feeStat != null) {
    dailyFee = parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn) + parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
    finalDailyFee = (dailyFee / 1e30);
    userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
    finalUserFee = (userFee / 1e30);

  }
  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
    dailyProtocolRevenue: "0",
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.7).toString(),
  };
};


const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.POLYGON],
  fetch,
  methodology,
  start: '2022-12-31',
  deadFrom: "2023-12-31",
}

export default adapter;
