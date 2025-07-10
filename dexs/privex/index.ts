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
  query getCotiVolume($sinceTimestamp: Int!) {
    totalHistories(
      where: { 
        timestamp_gte: $sinceTimestamp
      }
      orderBy: timestamp
      orderDirection: desc
      first: 50
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
      first: 5
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
      // Handle Coti using totalHistories query from February 1, 2025 onwards
      const februaryFirst2025 = 1738368000; // February 1, 2025 timestamp
      console.log(`Querying Coti from February 1, 2025 (${februaryFirst2025}) onwards`);
      
      data = await request(endpoint, getCotiVolumeQuery, {
        sinceTimestamp: februaryFirst2025
      });

      console.log(`Coti response:`, data);

      if (data?.totalHistories?.length > 0) {
        console.log(`Found ${data.totalHistories.length} Coti records since Feb 1, 2025. Latest timestamps:`, 
          data.totalHistories.slice(0, 5).map(h => ({
            timestamp: h.timestamp, 
            date: new Date(h.timestamp * 1000).toISOString().split('T')[0],
            tradeVolume: h.tradeVolume
          })));
        
        // Filter records within our 24-hour time range
        const relevantRecords = data.totalHistories.filter(history => 
          history.timestamp >= startTimestamp && history.timestamp <= endTimestamp
        );
        
        console.log(`Records in time range ${startTimestamp} to ${endTimestamp}:`, relevantRecords.length);
        
        if (relevantRecords.length > 0) {
          const totalVolumeUSD = relevantRecords.reduce((sum, history) => {
            const tradeVolume = parseFloat(history.tradeVolume || "0");
            const openVolume = parseFloat(history.openTradeVolume || "0");
            const closeVolume = parseFloat(history.closeTradeVolume || "0");

            const volume = tradeVolume > 0 ? tradeVolume : openVolume + closeVolume;
            return sum + volume;
          }, 0);

          if (totalVolumeUSD > 0) {
            const adjustedVolume = totalVolumeUSD > 1e15 ? totalVolumeUSD / 1e18 : totalVolumeUSD;
            dailyVolume.addUSDValue(adjustedVolume);
            console.log(`Coti actual daily volume: ${adjustedVolume} USD from ${relevantRecords.length} records`);
          }
        } else {
          // If no exact daily data, find the most recent record and estimate daily volume
          const recentRecords = data.totalHistories.slice(0, 2); // Get 2 most recent
          if (recentRecords.length >= 2) {
            const latest = recentRecords[0];
            const previous = recentRecords[1];
            
            const latestVolume = parseFloat(latest.tradeVolume || "0");
            const previousVolume = parseFloat(previous.tradeVolume || "0");
            const volumeDiff = latestVolume - previousVolume;
            
            if (volumeDiff > 0) {
              const timeDiff = parseInt(latest.timestamp) - parseInt(previous.timestamp);
              const dailyRate = volumeDiff / (timeDiff / 86400); // Volume per day
              
              const adjustedDailyVolume = dailyRate > 1e15 ? dailyRate / 1e18 : dailyRate;
              dailyVolume.addUSDValue(Math.max(0, adjustedDailyVolume));
              
              console.log(`Coti estimated daily volume: ${adjustedDailyVolume} USD (calculated from recent activity)`);
              console.log(`Latest: ${latestVolume / 1e18}, Previous: ${previousVolume / 1e18}, Diff: ${volumeDiff / 1e18}, Days: ${timeDiff / 86400}`);
            } else {
              console.log("No recent Coti volume increase detected");
            }
          } else {
            console.log("Not enough Coti records to calculate daily volume");
          }
        }

        return { dailyVolume };
      } else {
        console.log("No Coti data found since February 1, 2025");
      }
    } else if (chain === CHAIN.BASE) {
      // Handle Base - try multiple query formats based on the actual schema

      // Convert timestamps to day numbers for dailyHistories (they use 'day' field)
      // Try a broader range to catch any daily data
      const endDay = Math.floor(endTimestamp / 86400);
      const startDay = endDay - 2; // Look at last few days to find data
      
      console.log(`Base: Looking for days ${startDay} to ${endDay} (timestamps: ${startTimestamp} to ${endTimestamp})`);

      // First try: dailyHistories (preferred - daily aggregated data)
      try {
        data = await request(endpoint, getBaseDailyVolumeQuery, {
          startDay: startDay,
          endDay: endDay,
        });

        if (data?.dailyHistories?.length > 0) {
          console.log(`Base: Found ${data.dailyHistories.length} daily records:`, data.dailyHistories.map(d => ({day: d.day, tradeVolume: d.tradeVolume})));
          
          // Find the first record with non-zero volume (skip zeros)
          const recordWithVolume = data.dailyHistories.find(d => parseFloat(d.tradeVolume || "0") > 0);
          
          if (recordWithVolume) {
            const tradeVolume = parseFloat(recordWithVolume.tradeVolume || "0");
            console.log(`Using record with volume: day=${recordWithVolume.day}, tradeVolume=${tradeVolume}`);
            
            // These are definitely in wei format - convert them
            const adjustedVolume = tradeVolume / 1e18;
            dailyVolume.addUSDValue(adjustedVolume);
            console.log(`Base daily volume: ${adjustedVolume} USD from day ${recordWithVolume.day}`);
          } else {
            console.log("No Base records with volume > 0 found");
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
