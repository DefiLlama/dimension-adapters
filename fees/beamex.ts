import { gql, request } from "graphql-request";
import { Adapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpointsBeamex: ChainEndpoints = {
  [CHAIN.MOONBEAN]:
    "https://api.thegraph.com/subgraphs/name/flisko/stats-moonbeam",
};

const methodologyBeamex = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.1% to 0.4%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.02%)",
  UserFees:
    "Fees from open/close position (0.1%), swap (0.1% to 0.4%) and borrow fee ((assets borrowed)/(total assets in pool)*0.04%)",
  HoldersRevenue:
    "30% of all collected fees are distributed to $stGLINT stakers",
  SupplySideRevenue:
    "70% of all collected fees will be distributed to BLP stakers. Currently they are distributed to treasury",
  Revenue: "70% of all collected fees are distributed to the treasury",
  ProtocolRevenue: "70% of all collected fees are distributed to the treasury",
};

const graphsBeamex = (chain: string) => async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const searchTimestamp = todaysTimestamp;

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;


  const graphQuery2 = gql`{
    feeStat(id: "total") {
      id
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;

  const graphRes = await request(endpointsBeamex[chain], graphQuery);
  const graphRes2 = await request(endpointsBeamex[chain], graphQuery2);

  const totalFee =
    parseInt(graphRes2.feeStat.mint) +
    parseInt(graphRes2.feeStat.burn) +
    parseInt(graphRes2.feeStat.marginAndLiquidation) +
    parseInt(graphRes2.feeStat.swap);
  const finalTotalFee = totalFee / 1e30;

  const totalUserFee =
    parseInt(graphRes2.feeStat.marginAndLiquidation) +
    parseInt(graphRes2.feeStat.swap);
  const finalTotalUserFee = totalUserFee / 1e30;

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    timestamp,
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.7).toString(),
    dailyProtocolRevenue: (finalDailyFee * 0.7).toString(),
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.3).toString(),
    totalFees: finalTotalFee.toString(),
    totalProtocolRevenue: (finalTotalFee * 0.7).toString(),
    totalRevenue: (finalTotalFee * 0.7).toString(),
    totalUserFees: finalTotalUserFee.toString(),
    totalSupplySideRevenue: (finalTotalFee * 0.3).toString(),


  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch: graphsBeamex(CHAIN.MOONBEAM),
      start: 1687421388,
      meta: {
        methodology: methodologyBeamex,
      },
    },
  },
};

export default adapter;
