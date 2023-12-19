import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.LINEA]:
    "https://linea-graph-node.metavault.trade/subgraphs/name/metavault/perpv1",
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
    [CHAIN.LINEA]: {
      fetch: graphs(endpoints)(CHAIN.LINEA),
      start: async () => 1701950449,
      meta: {
        methodology: "All treasuryFee, poolFee and keeperFee are collected",
      },
    },
  },
};

export default adapter;
