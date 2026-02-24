import { gql, GraphQLClient } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/metis-andromeda-prod-stats",
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const floorDayTimestamp = getTimestampAtStartOfDayUTC(options.startTimestamp);
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
  graphQLClient.setHeader("origin", "https://zeno.exchange");
  const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

  const finalizedDailyFee =
    Number(dailyFeeResp.dailyFeesStat.totalFeePaid) / 1e30;

  const finalizedDailyFeeWithoutFundingFee =
    (Number(dailyFeeResp.dailyFeesStat.tradingFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.borrowingFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.liquidationFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.settlementFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.addLiquidityFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.removeLiquidityFeePaid)) /
    1e30;
  const finalizedDailyUserFee =
    (Number(dailyFeeResp.dailyFeesStat.tradingFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.borrowingFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.liquidationFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.fundingFeePaid) +
      Number(dailyFeeResp.dailyFeesStat.settlementFeePaid)) /
    1e30;
  const dailyHoldersRevenue =
    (finalizedDailyFeeWithoutFundingFee * 35) / 90;
  const dailyProtocolRevenue =
    (finalizedDailyFeeWithoutFundingFee * 5) / 90;
  const dailySupplySideRevenue =
    (finalizedDailyFeeWithoutFundingFee * 50) / 90;

  return {
    dailyFees: finalizedDailyFee.toString(),
    dailyUserFees: finalizedDailyUserFee.toString(),
    dailyRevenue: (dailyHoldersRevenue + dailyProtocolRevenue).toString(),
    dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    dailyHoldersRevenue: dailyHoldersRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.METIS]: {
      fetch,
      start: '2024-03-13',
    },
  },
};

export default adapter;
