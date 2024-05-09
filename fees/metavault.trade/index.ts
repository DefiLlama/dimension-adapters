import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { POLYGON } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/sdcrypt0/metavault-mvx-subgraph",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
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

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee =
        parseInt(graphRes.feeStat.mint) +
        parseInt(graphRes.feeStat.burn) +
        parseInt(graphRes.feeStat.marginAndLiquidation) +
        parseInt(graphRes.feeStat.swap);
      const finalDailyFee = dailyFee / 1e30;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyRevenue: (finalDailyFee * 0.3).toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(endpoints)(POLYGON),
      start: 1654041600,
      meta: {
        methodology: 'All mint, burn, marginAndLiquidation and swap fees are collected and the daily fee amount is determined. Daily revenue is calculated as 30% of the total fee.'
      }
    },
  },
};

export default adapter;
