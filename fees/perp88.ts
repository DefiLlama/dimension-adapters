import { Adapter } from "../adapters/types";
import { ARBITRUM, CHAIN, POLYGON } from "../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const endpoints = {
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/perp88/plp-pool",
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3a60064481e5/1lxclx3pz4zrusx6414nvj/arbitrum-one-stats/api",
};

interface IData {
  totalFees: string;
}
interface IGraph {
  yesterday: IData;
  today: IData;
  statistic: IData;
}
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

        const graphRes: IGraph = await request(graphUrls[chain], graphQuery);
        const graphResDaily: IGraph = await request(graphUrls[chain], queryDaily);
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
        const graphQLClient = new GraphQLClient(graphUrls[chain]);
        graphQLClient.setHeader('origin', 'https://hmx.org')
        const totalFeeResp = await graphQLClient.request(totalFeeQuery);
        const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

        const finalizedDailyFee = (Number(dailyFeeResp.dailyFeesStat.totalFeePaid) / 1e30);
        const finalizedTotalFee = (Number(totalFeeResp.globalFeesStat.totalFeePaid) / 1e30);

        return {
          timestamp,
          dailyFees: finalizedDailyFee.toString(),
          totalFees: finalizedTotalFee.toString(),
          dailyHoldersRevenue: (finalizedDailyFee * 0.25).toString(),
          dailySupplySideRevenue: (finalizedDailyFee * 0.75).toString(),
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
      start: 1668643200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1687392000,
    }
  },
};

export default adapter;
