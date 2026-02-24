import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "../../adapters/types";
import { HOUR, getTimestampAtStartOfHour } from "../../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/3a60064481e5/1lxclx3pz4zrusx6414nvj/arbitrum-one-stats/api",
  [CHAIN.BLAST]:
    "https://api.studio.thegraph.com/query/45963/blast-mainnet-stats/version/latest",
};

type MarketStat = {
  id: string;
  totalTradingVolume: string;
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      if (chain === CHAIN.ARBITRUM || chain === CHAIN.BLAST) {
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
        graphQLClient.setHeader("origin", "https://hmx.org");
        const totalMarketStats = (
          await graphQLClient.request(totalTradingVolumeQuery)
        ).marketStats as Array<MarketStat>;

        const chunkSize = 10;
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
            getTimestampAtStartOfHour(timestamp) / HOUR
          );

          for (const marketStat of markets) {
            for (let i = 1; i < 25; i++) {
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
          timestamp,
          dailyVolume: last24hrVolume.toString(),
        };
      }

      return {
        timestamp,
        dailyVolume: "0",
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: '2023-06-26',
    },
    [CHAIN.BLAST]: {
      fetch: graphs(endpoints)(CHAIN.BLAST),
      start: '2024-02-05',
    },
  },
};

export default adapter;
