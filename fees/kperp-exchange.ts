import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints:Record<string, string> = {
  [CHAIN.KAVA]: "https://graph-node.kperp.exchange/subgraphs/name/kperp/core",
};

const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
    feeStat(id: "${searchTimestamp}") {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
  };
};

const adapter: Adapter = {
  deadFrom: "2023-02-24",
  adapter: {
    [CHAIN.KAVA]: {
      fetch: async (timestamp: number) => {return{timestamp}},
    },
  },
  methodology: 'All mint, burn, marginAndLiquidation and swap fees are collected and the daily fee amount is determined. Daily revenue is calculated as 30% of the total fee.'
};

export default adapter;
