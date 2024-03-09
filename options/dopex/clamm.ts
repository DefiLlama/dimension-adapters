import { request, gql } from "graphql-request";

import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGetChainStatsParams {
  graphUrl: string;
  timestamp: string;
}

interface IQueryResponse {
  optionMarkets: Array<{
    totalFees: string;
    totalVolume: string;
    totalPremium: string;
  }>;
  optionMarketDailyStats: Array<{
    volume: string;
    fees: string;
    premium: string;
  }>;
}

async function getChainStats({ graphUrl, timestamp }: IGetChainStatsParams) {
  const dailyVolumeQuery = gql`
    query GetStatsForDefiLamma($fromTimestamp: Int, $toTimestamp: Int) {
      optionMarkets(first: 1000) {
        totalFees
        totalVolume
        totalPremium
      }

      optionMarketDailyStats(
        first: 1000
        orderDirection: asc
        orderBy: startTimestamp
        where: {
          startTimestamp_gte: $fromTimestamp
          startTimestamp_lte: $toTimestamp
          volume_gt: 0
        }
      ) {
        volume
        fees
        premium
      }
    }
  `;

  const toTimestamp = getUniqStartOfTodayTimestamp(
    new Date(Number(timestamp) * 1000)
  );
  const fromTimestamp = toTimestamp - 60 * 60 * 24;

  const queryResponse: IQueryResponse = await request(
    graphUrl,
    dailyVolumeQuery,
    { fromTimestamp: fromTimestamp, toTimestamp: toTimestamp }
  );

  const cumulative = queryResponse.optionMarkets.reduce(
    (acc, market) => {
      return {
        totalNotionalVolume:
          acc.totalNotionalVolume + Number(market.totalVolume),
        totalFees: acc.totalFees + Number(market.totalPremium),
        totalRevenue: acc.totalRevenue + Number(market.totalFees),
      };
    },
    {
      totalNotionalVolume: 0,
      totalFees: 0,
      totalRevenue: 0,
    }
  );

  const daily = queryResponse.optionMarketDailyStats.reduce(
    (acc, market) => {
      return {
        dailyNotionalVolume: acc.dailyNotionalVolume + Number(market.volume),
        dailyFees: acc.dailyFees + Number(market.premium),
        dailyRevenue: acc.dailyRevenue + Number(market.fees),
      };
    },
    {
      dailyNotionalVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
    }
  );

  return {
    timestamp,
    totalPremiumVolume: cumulative.totalFees,
    dailyPremiumVolume: daily.dailyFees,
    ...cumulative,
    ...daily,
  };
}

export { getChainStats };
