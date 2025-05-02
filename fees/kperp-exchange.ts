import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Adapter, DISABLED_ADAPTER_KEY } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import disabledAdapter from "../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.KAVA]: "https://graph-node.kperp.exchange/subgraphs/name/kperp/core",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: CHAIN) => {
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
  deadFrom: "2024-12-14",
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.KAVA]: {
      fetch: async (timestamp: number) => {return{timestamp}},
      meta: {
        methodology: 'All mint, burn, marginAndLiquidation and swap fees are collected and the daily fee amount is determined. Daily revenue is calculated as 30% of the total fee.'
      }
    },
  },
};

export default adapter;
