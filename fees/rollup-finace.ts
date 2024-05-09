import { Adapter } from "../adapters/types";
import { ARBITRUM, AVAX, CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.ERA]: "https://subgraph.rollup.finance/subgraphs/name/rollUp/stats",
}


const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const fromTimestamp = todaysTimestamp - 60 * 60 * 24
      const searchTimestamp  = todaysTimestamp;

      const graphQuery = gql
      `{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
        }
      }`;

      const graphQueryYesterday = gql
      `{
        feeStat(id: "${fromTimestamp}") {
          mint
          burn
          marginAndLiquidation
        }
      }`;


      const graphRes = await request(graphUrls[chain], graphQuery);
      const graphResYesterday = await request(graphUrls[chain], graphQueryYesterday);


      const dailyFee = parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn) + parseInt(graphRes.feeStat.marginAndLiquidation);
      const finalDailyFee = (dailyFee / 1e30);
      const userFee = parseInt(graphRes.feeStat.marginAndLiquidation)
      const finalUserFee = (userFee / 1e30);

      const dailyFeePrev = parseInt(graphResYesterday.feeStat.mint) + parseInt(graphResYesterday.feeStat.burn) + parseInt(graphResYesterday.feeStat.marginAndLiquidation);
      const finalDailyFeePrev = (dailyFeePrev / 1e30);
      const userFeePrev = parseInt(graphResYesterday.feeStat.marginAndLiquidation)
      const finalUserFeePrev = (userFeePrev / 1e30);
      const dailyFees = finalDailyFee - finalDailyFeePrev;
      const dailyUserFees = finalUserFee - finalUserFeePrev;

      return {
        timestamp,
        dailyFees: dailyFees ? dailyFees.toString() : undefined,
        dailyUserFees: dailyUserFees ?  dailyUserFees.toString() : undefined,
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: graphs(endpoints)(CHAIN.ERA),
      start: 1682035200,
    },
  }
}

export default adapter;
