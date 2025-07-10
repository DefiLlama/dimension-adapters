// PriveX Volume Adapter for DefiLlama
// File: dexs/privex/index.ts

import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

// GraphQL endpoints for each chain
const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

// GraphQL query for Coti - using totalHistories
const getCotiVolumeQuery = gql`
  query getCotiVolume($startTime: Int!, $endTime: Int!) {
    totalHistories(
      where: { 
        timestamp_gte: $startTime, 
        timestamp_lt: $endTime 
      }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      updateTimestamp
      tradeVolume
      quotesCount
      accounts
      users
      openTradeVolume
      closeTradeVolume
      deposit
      withdraw
    }
  }
`;

// GraphQL query for Base - using DailyHistory (best for daily volume aggregates)
const getBaseDailyVolumeQuery = gql`
  query getBaseDailyVolume($startDay: Int!, $endDay: Int!) {
    dailyHistories(
      where: { 
        day_gte: $startDay, 
        day_lte: $endDay 
      }
      orderBy: day
      orderDirection: desc
      first: 1
    ) {
      id
      day
      tradeVolume
      openTradeVolume
      closeTradeVolume
      liquidateTradeVolume
      quotesCount
      activeUsers
      newUsers
      platformFee
      accountSource
      timestamp
    }
  }
`;

// Alternative Base query using individual trade records if daily aggregates don't work
const getBaseTradeHistoryQuery = gql`
  query getBaseTradeHistory($startTime: Int!, $endTime: Int!) {
    tradeHistories(
      where: { 
        timestamp_gte: $startTime, 
        timestamp_lt: $endTime 
      }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      volume
      account
      quoteStatus
      blockNumber
    }
  }
`;

// Third option: Base TotalHistory for cumulative data
const getBaseTotalHistoryQuery = gql`
  query getBaseTotalHistory($startTime: Int!, $endTime: Int!) {
    totalHistories(
      where: { 
        timestamp_gte: $startTime, 
        timestamp_lt: $endTime 
      }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      tradeVolume
      openTradeVolume
      closeTradeVolume
      liquidateTradeVolume
      quotesCount
      users
      accounts
      platformFee
      accountSource
    }
  }
`;

// Fetch function for volume data
const fetch: FetchV2 = async ({ endTimestamp, startTimestamp, chain, createBalances }) => {
  const dailyVolume = createBalances();
  const endpoint = endpoints[chain];

  if (!endpoint) {
    throw new Error(`No endpoint configured for chain: ${chain}`);
  }

  try {
    let data;

    if (chain === CHAIN.COTI) {
      // Handle Coti using totalHistories query
      console.log(`Querying Coti between ${startTimestamp} and ${endTimestamp}`);
      
      data = await request(endpoint, getCotiVolumeQuery, {
        startTime: startTimestamp,
        endTime: endTimestamp,
      });

      console.log(`Coti response:`, data);

      if (data?.totalHistories?.length > 0) {
        // Sum up tradeVolume from all records in the time range
        const totalVolumeUSD = data.totalHistories.reduce((sum, history) => {
          const tradeVolume = parseFloat(history.tradeVolume || "0");
          const openVolume = parseFloat(history.openTradeVolume || "0");
          const closeVolume = parseFloat(history.closeTradeVolume || "0");

          // Use tradeVolume if available, otherwise sum open and close volumes
          const volume = tradeVolume > 0 ? tradeVolume : openVolume + closeVolume;
          console.log(`Coti record: tradeVolume=${tradeVolume}, openVolume=${openVolume}, closeVolume=${closeVolume}, using=${volume}`);
          return sum + volume;
        }, 0);

        if (totalVolumeUSD > 0) {
          // Check if values seem to be in wei and convert if needed
          const adjustedVolume = totalVolumeUSD > 1e15 ? totalVolumeUSD / 1e18 : totalVolumeUSD;
          dailyVolume.addUSDValue(adjustedVolume);
          console.log(`Coti final volume: ${adjustedVolume} USD from ${data.totalHistories.length} records`);
        }

        return { dailyVolume };
      } else {
        console.log("No Coti totalHistories data found");
      }
    } else if (chain === CHAIN.BASE) {
      // Handle Base - try multiple query formats based on the actual schema

      // Convert timestamps to day numbers for dailyHistories (they use 'day' field)
      const currentDay = Math.floor(endTimestamp / 86400); // Get the current day only
      const startDay = currentDay; // Only get today's data
      const endDay = currentDay;

      // First try: dailyHistories (preferred - daily aggregated data)
      try {
        data = await request(endpoint, getBaseDailyVolumeQuery, {
          startDay: startDay,
          endDay: endDay,
        });

        if (data?.dailyHistories?.length > 0) {
          const totalVolumeUSD = data.dailyHistories.reduce((sum, daily) => {
            // Only use tradeVolume to avoid double counting
            const tradeVolume = parseFloat(daily.tradeVolume || "0");
            
            return sum + tradeVolume;
          }, 0);

          if (totalVolumeUSD > 0) {
            // Check if values seem to be in wei (too high) and convert
            const adjustedVolume = totalVolumeUSD > 1e15 ? totalVolumeUSD / 1e18 : totalVolumeUSD;
            dailyVolume.addUSDValue(adjustedVolume);
            console.log(`Base daily volume: ${adjustedVolume} USD from ${data.dailyHistories.length} records`);
          }

          return { dailyVolume };
        }
      } catch (e) {
        console.log("Base dailyHistories query failed, trying totalHistories...");
      }

      // Second try: totalHistories (similar to Coti)
      try {
        data = await request(endpoint, getBaseTotalHistoryQuery, {
          startTime: startTimestamp,
          endTime: endTimestamp,
        });

        if (data?.totalHistories?.length > 0) {
          const totalVolumeUSD = data.totalHistories.reduce((sum, history) => {
            // Only use tradeVolume to avoid double counting (consistent with dailyHistories)
            const tradeVolume = parseFloat(history.tradeVolume || "0");
            return sum + tradeVolume;
          }, 0);

          if (totalVolumeUSD > 0) {
            // Check if values seem to be in wei (too high) and convert
            const adjustedVolume = totalVolumeUSD > 1e15 ? totalVolumeUSD / 1e18 : totalVolumeUSD;
            dailyVolume.addUSDValue(adjustedVolume);
            console.log(`Base total volume: ${adjustedVolume} USD from ${data.totalHistories.length} records`);
          }

          return { dailyVolume };
        }
      } catch (e) {
        console.log("Base totalHistories query failed, trying individual trades...");
      }

      // Third try: individual tradeHistories
      try {
        data = await request(endpoint, getBaseTradeHistoryQuery, {
          startTime: startTimestamp,
          endTime: endTimestamp,
        });

        if (data?.tradeHistories?.length > 0) {
          const totalVolumeUSD = data.tradeHistories.reduce((sum, trade) => {
            const volume = parseFloat(trade.volume || "0");
            return sum + volume;
          }, 0);

          if (totalVolumeUSD > 0) {
            dailyVolume.addUSDValue(totalVolumeUSD);
          }

          return { dailyVolume };
        }
      } catch (e) {
        console.log("All Base queries failed");
      }
    }

    // If no data found, return empty volume
    console.log(`No volume data found for ${chain} between ${startTimestamp} and ${endTimestamp}`);
    return { dailyVolume };

  } catch (error) {
    console.error(`Error fetching volume for ${chain}:`, error);
    return { dailyVolume };
  }
};

// Adapter configuration
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: 1728345600, // October 8, 2024
    },
    [CHAIN.COTI]: {
      fetch,
      start: 1735689600, // January 1, 2025
    },
  },
  meta: {
    methodology: {
      Volume: "PriveX trading volume is calculated by summing all trade transactions across Base and Coti networks using subgraph data.",
      DailyVolume: "Daily volume represents the total USD value of all trades executed on PriveX within a 24-hour period, including open trades, close trades, and liquidations.",
    },
  },
};

export default adapter;
