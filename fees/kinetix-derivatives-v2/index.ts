import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.KAVA]:
    "https://kava-graph-node.metavault.trade/subgraphs/name/kinetixfi/kava-trade",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
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

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = parseInt(graphRes.feeStats[0].feeUsd);

      const finalDailyFee = dailyFee / 1e18;
      const totalFees = parseInt(graphRes.feeStats[0].cumulativeFeeUsd) / 1e18;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        totalFees: totalFees.toString(),
        //dailyRevenue: (finalDailyFee * 0.3).toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.KAVA]: {
      fetch: graphs(endpoints)(CHAIN.KAVA),
      start: async () => 1706832000,
      meta: {
        methodology: "All treasury, pool and keeper fees are collected",
      },
    },
  },
};

export default adapter;
