import { gql, request } from "graphql-request";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  // [CHAIN.KAVA]: "https://the-graph.kava.io/subgraphs/name/kinetixfi/v3-subgraph", // subgraph stale since April 2024, protocol winding down
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/55804/kinetixfi-base-v3/version/latest",
};

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const fetch = (endpoint) => {
  return async (timestamp: number) => {
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

    const response = await request(endpoint, graphQuery);
    const feeStats: IFeeStat[] = response.feeStats;

    let dailyFeeUSD = BigInt(0);

    feeStats.forEach((fee) => {
      dailyFeeUSD += BigInt(fee.feeUsd);
    });

    const finalDailyFee = parseInt(dailyFeeUSD.toString()) / 1e18;

    return {
      timestamp: todaysTimestamp,
      dailyFees: finalDailyFee.toString(),
    };
  };
};

const adapter: Adapter = {
  methodology: "Fees collected from user trading fees",
  version: 1,
  adapter: {
    // [CHAIN.KAVA]: {
    //   fetch: fetch(endpoints[CHAIN.KAVA]),
    //   start: '2023-08-15', // Tuesday, August 15, 2023 12:00:00 AM
    // },
    [CHAIN.BASE]: {
      fetch: fetch(endpoints[CHAIN.BASE]),
      start: '2024-05-08', //  Wednesday, May 8, 2024 12:00:00 AM
    },
  },
};

export default adapter;
