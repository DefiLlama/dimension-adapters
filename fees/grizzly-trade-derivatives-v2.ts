import { FetchOptions, Adapter } from "../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.BSC]:
    "https://api.studio.thegraph.com/query/55804/bnb-trade/version/latest",
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
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
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-02-02',
  methodology: {
    Fees: "All treasury, pool and keeper fees are collected",
  },
  deadFrom: "2024-10-27",
};

export default adapter;
