import { Chain } from "../../adapters/types";
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

      return {
        timestamp,
        dailyFees: finalDailyFee,
      };
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.KAVA]: {
      fetch: graphs(endpoints)(CHAIN.KAVA),
      start: '2024-02-02',
    },
  },
  methodology: "All treasury, pool and keeper fees are collected",
};

export default adapter;
