import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { HOUR, getTimestampAtStartOfHour } from "../../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3a60064481e5/1lxclx3pz4zrusx6414nvj/arbitrum-one-stats/api",
};

type MarketStat = {
  id: string;
  totalTradingVolume: string;
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      if (chain === CHAIN.ARBITRUM) {
        // Get total trading volume
        const totalTradingVolumeQuery = gql`
          {
            marketStats {
              id
              totalTradingVolume
            }
          }
        `;
        const graphQLClient = new GraphQLClient(graphUrls[chain]);
        graphQLClient.setHeader('origin', 'https://hmx.org')
        const totalMarketStats = (
          await graphQLClient.request(totalTradingVolumeQuery)
        ).marketStats as Array<MarketStat>;
        const totalVolume =
          totalMarketStats.reduce(
            (accum: number, t: MarketStat) =>
              accum + parseInt(t.totalTradingVolume),
            0 as number
          ) / 1e30;

        // Get daily trading volume
        const ids: Array<string> = [];
        let latestHourIndex = Math.floor(
          getTimestampAtStartOfHour(timestamp) / HOUR
        );
        for (let i = 0; i < 24; i++) {
          for (const marketStat of totalMarketStats) {
            ids.push(`"${latestHourIndex - i}_${marketStat.id}"`);
          }
        }
        const filter = ids.join(",");
        // first 2400 should covers 100 markets last 24 hours
        // which virtually covers all markets
        const last24hrVolumeQuery = gql`
            {
              marketHourlyStats(
                first: 2400
                where: {
                  id_in: [${filter}]
                }
              ) {
                tradingVolume
              }
            }
          `;
        const last24hrMarketStats = (
          await graphQLClient.request(last24hrVolumeQuery)
        ).marketHourlyStats as Array<{ tradingVolume: string }>;
        const last24hrVolume =
          last24hrMarketStats.reduce(
            (accum, t) => accum + parseInt(t.tradingVolume),
            0 as number
          ) / 1e30;

        return {
          timestamp,
          totalVolume: totalVolume.toString(),
          dailyVolume: last24hrVolume.toString(),
        };
      }

      return {
        timestamp,
        totalVolume: "0",
        dailyVolume: "0",
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1687806000,
    },
  },
};

export default adapter;
