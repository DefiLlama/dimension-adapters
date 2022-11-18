import { Adapter } from "../adapters/types";
import { CHAIN, POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const endpoints = {
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/perp88/plp-pool",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

      const todaysBlock = (await getBlock(todaysTimestamp, "polygon", {}));
      const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, "polygon", {}));
      const graphQuery = gql`
        {
          statistic(id: 0, block: {number: ${yesterdaysBlock}}) {
            totalFees
          }
        }
      `;
      const queryDaily = gql`
        query fees {
            yesterday: statistic(id: "0", block: {number: ${yesterdaysBlock}}){
              totalFees
            }
            today: statistic(id: "0", block: {number: ${todaysBlock}}) {
              totalFees
            }
          }
      `

      const graphRes = await request(graphUrls[chain], graphQuery);
      const graphResDaily = await request(graphUrls[chain], queryDaily);
      const dailyFee = (Number(graphResDaily.yesterday.totalFees) - Number(graphResDaily.today.totalFees))/1e30;
      const totalFees = parseInt(graphRes.statistic.totalFees) / 1e30;

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        totalFees: totalFees.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: graphs(endpoints)(CHAIN.POLYGON),
      start: async () => 0,
    },
  },
};

export default adapter;
