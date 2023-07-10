import { Adapter } from "../adapters/types";
import { ARBITRUM, CHAIN, POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const endpoints = {
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/perp88/plp-pool",
  [ARBITRUM]: "https://subgraph.satsuma-prod.com/6350b8b3ceb3/92d146b1e22261b5990c85a8b277ed8804ce4906c5e095f5311b4e4ce8ce4bf8/arbitrum-one-stats/version/v.0.0.4/api",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      if (chain === CHAIN.POLYGON) {
        const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
        const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

        const todaysBlock = (await getBlock(todaysTimestamp, chain, {}));
        const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
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
      } else if (chain === CHAIN.ARBITRUM) {
        const floorDayTimestamp = getTimestampAtStartOfDayUTC(timestamp);
        const totalFeeQuery = gql`
          {
            globalFeesStat(id: "global") {
              totalFeePaid
            }
          }
        `
        const dailyFeeQuery = gql`
          {
            dailyFeesStat(id: "${floorDayTimestamp}") {
              totalFeePaid
            }
          }
        `

        const totalFeeResp = await request(graphUrls[chain], totalFeeQuery);
        const dailyFeeResp = await request(graphUrls[chain], dailyFeeQuery);

        return {
          timestamp,
          dailyFees: (Number(dailyFeeResp.dailyFeesStat.totalFeePaid) / 1e30).toString(),
          totalFees: (Number(totalFeeResp.globalFeesStat.totalFeePaid) / 1e30).toString(),
        }
      }

      return {
        timestamp,
        dailyFees: "0",
        totalFees: "0",
      }
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: graphs(endpoints)(CHAIN.POLYGON),
      start: async () => 1668643200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: async () => 1687392000,
    }
  },
};

export default adapter;
