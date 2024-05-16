import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { HOUR, getTimestampAtStartOfHour } from "../../utils/date";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.METIS]:
    "https://metisapi.0xgraph.xyz/subgraphs/name/metis-andromeda-prod-stats",
};

type MarketStat = {
  id: string;
  totalTradingVolume: string;
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (options: FetchOptions) => {
      const startTime = Date.now();
      const hourStartTime = startTime / 1e3;

      if (chain === CHAIN.METIS) {
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
        graphQLClient.setHeader("origin", "https://zeno.exchange");
        const totalMarketStats = (
          await graphQLClient.request(totalTradingVolumeQuery)
        ).marketStats as Array<MarketStat>;
        const totalVolume =
          totalMarketStats.reduce(
            (accum: number, t: MarketStat) =>
              accum + parseInt(t.totalTradingVolume),
            0 as number
          ) / 1e30;

        const chunkSize = 40;
        const splitMarket: MarketStat[][] = [];
        for (let i = 0; i < totalMarketStats.length; i += chunkSize) {
          const chunk = totalMarketStats.slice(i, i + chunkSize);
          splitMarket.push(chunk);
        }

        let last24hrVolume = 0;
        for (const markets of splitMarket) {
          // Get daily trading volume
          const ids: Array<string> = [];

          let latestHourIndex = Math.floor(
            getTimestampAtStartOfHour(hourStartTime) / HOUR
          );

          for (let i = 0; i < 24; i++) {
            for (const marketStat of markets) {
              ids.push(`"${latestHourIndex - i}_${marketStat.id}"`);
            }
          }

          const filter = ids.join(",");

          const last24hrVolumeQuery = gql`
            {
              marketHourlyStats(
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
          last24hrVolume +=
            last24hrMarketStats.reduce(
              (accum, t) => accum + parseInt(t.tradingVolume),
              0 as number
            ) / 1e30;
        }

        return {
          timestamp: startTime,
          totalVolume: totalVolume.toString(),
          dailyVolume: last24hrVolume.toString(),
        };
      }

      return {
        timestamp: startTime,
        totalVolume: "0",
        dailyVolume: "0",
      };
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.METIS]: {
      fetch: graphs(endpoints)(CHAIN.METIS),
      start: 1710294153,
    },
  },
};

export default adapter;
