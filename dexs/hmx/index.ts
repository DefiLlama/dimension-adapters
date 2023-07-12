import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { HOUR, getTimestampAtStartOfHour } from "../../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/6350b8b3ceb3/92d146b1e22261b5990c85a8b277ed8804ce4906c5e095f5311b4e4ce8ce4bf8/arbitrum-one-stats/version/v.0.0.4/api",
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
        const totalMarketStats = (
          await request(graphUrls[chain], totalTradingVolumeQuery)
        ).marketStats as Array<MarketStat>;
        const totalVolume =
          totalMarketStats.reduce(
            (accum: number, t: MarketStat) =>
              accum + parseInt(t.totalTradingVolume),
            0 as number
          ) / 1e30;

        // Get daily trading volume
        const hourIndexes: Array<number> = [];
        let latestHourIndex = Math.floor(
          getTimestampAtStartOfHour(timestamp) / HOUR
        );
        for (let i = 0; i < 24; i++) {
          hourIndexes.push(latestHourIndex - i);
        }
        let last24hrVolume: number = 0;
        for (const marketStat of totalMarketStats) {
          const filter = hourIndexes
            .map((h) => `"${h}_${marketStat.id}"`)
            .join(",");
          const last24hrVolumeQuery = gql`
            {
              marketHourlyStats(where: {
                id_in: [${filter}]
              }) {
                tradingVolume
              }
            }
          `;
          const last24hrMarketStats = (
            await request(graphUrls[chain], last24hrVolumeQuery)
          ).marketHourlyStats as Array<{ tradingVolume: string }>;
          last24hrVolume +=
            last24hrMarketStats.reduce(
              (accum, t) => accum + parseInt(t.tradingVolume),
              0 as number
            ) / 1e30;
        }

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
      start: async () => 1687806000,
    },
  },
};

export default adapter;
