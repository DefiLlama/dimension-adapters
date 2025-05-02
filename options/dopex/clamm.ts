import { request, gql } from "graphql-request";

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
    query GetStatsForDefiLamma($dayStart: Int!, $nextDayStart: Int!) {
      optionMarkets(first: 1000) {
        totalFees
        totalVolume
        totalPremium
      }

      optionMarketDailyStats(
        first: 1000
        orderDirection: asc
        orderBy: startTimestamp
        where: { startTimestamp_gte: $dayStart, startTimestamp_lt: $nextDayStart }
      ) {
        volume
        fees
        premium
      }
    }
  `;

  // Convert to same day boundaries as subgraph
  const dayStart = Math.floor(Number(timestamp) / 86400) * 86400;
  const nextDayStart = dayStart + 86400;

  const queryResponse: IQueryResponse = await request(
    graphUrl,
    dailyVolumeQuery,
    { dayStart, nextDayStart }
  );

  const cumulative = queryResponse.optionMarkets.reduce(
    (acc, market) => {
      return {
        totalNotionalVolume:
          acc.totalNotionalVolume + Number(market.totalVolume),
        totalPremiumVolume:
          acc.totalPremiumVolume + Number(market.totalPremium),
        totalRevenue: acc.totalRevenue + Number(market.totalFees),
      };
    },
    {
      totalNotionalVolume: 0,
      totalPremiumVolume: 0,
      totalRevenue: 0,
    }
  );

  const daily = queryResponse.optionMarketDailyStats.reduce(
    (acc, market) => {
      return {
        dailyNotionalVolume: acc.dailyNotionalVolume + Number(market.volume),
        dailyPremiumVolume: acc.dailyPremiumVolume + Number(market.premium),
        dailyRevenue: acc.dailyRevenue + Number(market.fees),
      };
    },
    {
      dailyNotionalVolume: 0,
      dailyPremiumVolume: 0,
      dailyRevenue: 0,
    }
  );

  return {
    timestamp: dayStart.toString(),
    ...cumulative,
    totalFees: cumulative.totalRevenue,
    ...daily,
    dailyFees: daily.dailyRevenue,
  };
}

export { getChainStats };