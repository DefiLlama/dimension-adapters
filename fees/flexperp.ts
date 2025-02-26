import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.BASE]:
    "https://subgraph.satsuma-prod.com/04ae1114b7fd/flex-trade/base-mainnet-stats/api",
};

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: FetchV2 = async ({ chain, startTimestamp }) => {
    if (chain === CHAIN.BASE) {
      const floorDayTimestamp = getTimestampAtStartOfDayUTC(startTimestamp);
      const totalFeeQuery = gql`
        {
          globalFeesStat(id: "global") {
            totalFeePaid
            settlementFeePaid
            liquidationFeePaid
            borrowingFeePaid
            tradingFeePaid
            addLiquidityFeePaid
            removeLiquidityFeePaid
            fundingFeePaid
          }
        }
      `;
      const dailyFeeQuery = gql`
          {
            dailyFeesStat(id: "${floorDayTimestamp}") {
              totalFeePaid
              settlementFeePaid
              liquidationFeePaid
              borrowingFeePaid
              tradingFeePaid
              addLiquidityFeePaid
              removeLiquidityFeePaid
              fundingFeePaid
            }
          }
        `;
      const graphQLClient = new GraphQLClient(graphUrls[chain]);
      graphQLClient.setHeader("origin", "https://flex.trade");
      const totalFeeResp = await graphQLClient.request(totalFeeQuery);
      const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

      const finalizedDailyFee =
        Number(dailyFeeResp.dailyFeesStat?.totalFeePaid || 0 ) / 1e30;
      const finalizedTotalFee =
        Number(totalFeeResp.globalFeesStat?.totalFeePaid || 0) / 1e30;
      const finalizedDailyFeeWithoutFundingFee =
        (Number(dailyFeeResp.dailyFeesStat?.tradingFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.borrowingFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.liquidationFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.settlementFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.addLiquidityFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.removeLiquidityFeePaid || 0)) /
        1e30;
      const finalizedDailyUserFee =
        (Number(dailyFeeResp.dailyFeesStat?.tradingFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.borrowingFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.liquidationFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.fundingFeePaid || 0) +
          Number(dailyFeeResp.dailyFeesStat?.settlementFeePaid || 0)) /
        1e30;
      const finalizedTotalUserFee =
        (Number(totalFeeResp.globalFeesStat.tradingFeePaid) +
          Number(totalFeeResp.globalFeesStat.borrowingFeePaid) +
          Number(totalFeeResp.globalFeesStat.liquidationFeePaid) +
          Number(totalFeeResp.globalFeesStat.fundingFeePaid) +
          Number(totalFeeResp.globalFeesStat.settlementFeePaid)) /
        1e30;

      const dailyHoldersRevenue = (finalizedDailyFeeWithoutFundingFee * 35) / 90;
      const dailyProtocolRevenue = (finalizedDailyFeeWithoutFundingFee * 5) / 90;
      const dailySupplySideRevenue = (finalizedDailyFeeWithoutFundingFee * 50) / 90;
      return {
        dailyFees: finalizedDailyFee.toString(),
        dailyUserFees: finalizedDailyUserFee.toString(),
        dailyRevenue: (dailyHoldersRevenue + dailyProtocolRevenue).toString(),
        dailyProtocolRevenue: dailyProtocolRevenue.toString(),
        dailyHoldersRevenue: dailyHoldersRevenue.toString(),
        dailySupplySideRevenue: dailySupplySideRevenue.toString(),
        totalFees: finalizedTotalFee.toString(),
        totalUserFees: finalizedTotalUserFee.toString(),
      };
    }

    return {
      dailyFees: "0",
      dailyUserFees: "0",
      dailyRevenue: "0",
      dailyProtocolRevenue: "0",
      dailyHoldersRevenue: "0",
      dailySupplySideRevenue: "0",
      totalFees: "0",
      totalUserFees: "0",
    };
  };
  return fetch;
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs(endpoints),
      start: '2025-02-20',
    },
  },
};

export default adapter;
