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
      const searchTimestamp  = todaysTimestamp;

      const graphQuery = gql
      `{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);
      console.log(graphRes)

      const dailyFee = parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn) + parseInt(graphRes.feeStat.marginAndLiquidation);
      const finalDailyFee = (dailyFee / 1e30);
      const userFee = parseInt(graphRes.feeStat.marginAndLiquidation)
      const finalUserFee = (userFee / 1e30);

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: graphs(endpoints)(CHAIN.ERA),
      start: async () => 1682035200,
    },
  }
}

export default adapter;
