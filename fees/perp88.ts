import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";

const endpoints: Record<string, string> = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3a60064481e5/1lxclx3pz4zrusx6414nvj/arbitrum-one-stats/api",
  [CHAIN.BLAST]: "https://api.studio.thegraph.com/query/45963/blast-mainnet-stats/version/latest",
};

const fetch = async (_t: any, _b: any, { chain, startOfDay }: any) => {
  const floorDayTimestamp = startOfDay;
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

  const graphQLClient = new GraphQLClient(endpoints[chain]);
  graphQLClient.setHeader("origin", "https://hmx.org");
  const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

  const finalizedDailyFee =
    Number(dailyFeeResp.dailyFeesStat?.totalFeePaid || 0 ) / 1e30;
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
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-06-22',
    },
    [CHAIN.BLAST]: {
      fetch,
      start: '2024-02-05',
    },
  },
};

export default adapter;
