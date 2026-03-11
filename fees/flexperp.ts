import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const chainConfig: Record<string, { url: string, start: string }> = {
  [CHAIN.BASE]: {
    url: "https://api.goldsky.com/api/public/project_cmgz6cyvn000i2bp2fv9nefon/subgraphs/base-mainnet-stats/prod/gn",
    start: '2025-02-20',
  },
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
  const graphQLClient = new GraphQLClient(chainConfig[options.chain].url);
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
  fetch,
  adapter: chainConfig,
};

export default adapter;
