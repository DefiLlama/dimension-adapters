import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.BASE]:
    "https://subgraph.satsuma-prod.com/04ae1114b7fd/flex-trade/base-mainnet-stats/api",
};

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const floorDayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

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
  const graphQLClient = new GraphQLClient(endpoints[options.chain]);
  graphQLClient.setHeader("origin", "https://flex.trade");
  const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

  const finalizedDailyFee = Number(dailyFeeResp.dailyFeesStat?.totalFeePaid || 0 ) / 1e30;
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
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-20',
    },
  },
};

export default adapter;
