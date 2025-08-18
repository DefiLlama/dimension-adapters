import { FetchOptions, Adapter } from "../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.BSC]:
    "https://api.studio.thegraph.com/query/55804/bnb-trade/version/latest",
};

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const period = "daily";

  const graphQuery = gql`{
    feeStats(where: {timestamp: ${todaysTimestamp}, period: "${period}"}) {
      id
      timestamp
      period
      cumulativeFee
      cumulativeFeeUsd
      feeUsd
    }
  }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee = parseInt(graphRes.feeStats[0].feeUsd);

  const finalDailyFee = dailyFee / 1e18;

  return {
    dailyFees: finalDailyFee,
    //dailyRevenue: (finalDailyFee * 0.3),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2024-02-02',
    },
  },
  methodology: {
    Fees: "All treasury, pool and keeper fees are collected",
  },
};

export default adapter;
