import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

const fetchCoti = async (_a: any, _b: any, options: FetchOptions) => {
  const endpoint = endpoints[options.chain];
  const startTime = options.startTimestamp;
  const endTime = options.endTimestamp;
  
  const query = gql`
    query volumes($startTime: Int!, $endTime: Int!) {
      totalHistories(
        where: { 
          timestamp_gte: $startTime, 
          timestamp_lte: $endTime 
        }
        orderBy: timestamp
        orderDirection: asc
        first: 1000
      ) {
        timestamp
        tradeVolume
        openTradeVolume
        closeTradeVolume
        platformFee
      }
    }
  `;

  try {
    const graphRes = await request(endpoint, query, {
      startTime,
      endTime
    });

    let totalVolume = 0;
    let totalFees = 0;

    if (graphRes?.totalHistories?.length > 0) {
      graphRes.totalHistories.forEach((history: any) => {
        // Sum all volume types
        const tradeVolume = parseFloat(history.tradeVolume || "0");
        const openVolume = parseFloat(history.openTradeVolume || "0");
        const closeVolume = parseFloat(history.closeTradeVolume || "0");
        
        totalVolume += tradeVolume + openVolume + closeVolume;
        
        // Add platform fees
        const platformFee = parseFloat(history.platformFee || "0");
        totalFees += platformFee;
      });
    }

    return {
      dailyVolume: totalVolume / 1e18, // Convert from wei
      dailyFees: totalFees / 1e18 // Convert from wei
    };
  } catch (error) {
    console.error(`Error fetching COTI data:`, error);
    return {
      dailyVolume: 0,
      dailyFees: 0
    };
  }
};

const fetchBase = async (_a: any, _b: any, options: FetchOptions) => {
  const endpoint = endpoints[options.chain];
  const day = Math.floor(options.endTimestamp / 86400);
  
  const query = gql`
    query volumes($day: Int!) {
      dailyHistories(
        where: { day: $day }
        orderBy: day
        orderDirection: desc
        first: 100
      ) {
        day
        tradeVolume
        openTradeVolume
        closeTradeVolume
        liquidateTradeVolume
        platformFee
      }
    }
  `;

  try {
    const data = await request(endpoint, query, { day });
    
    let totalVolume = 0;
    let totalFees = 0;

    if (data?.dailyHistories?.length > 0) {
      data.dailyHistories.forEach((daily: any) => {
        // Sum all volume types
        const tradeVolume = parseFloat(daily.tradeVolume || "0");
        const openVolume = parseFloat(daily.openTradeVolume || "0");
        const closeVolume = parseFloat(daily.closeTradeVolume || "0");
        const liquidateVolume = parseFloat(daily.liquidateTradeVolume || "0");
        
        totalVolume += tradeVolume + openVolume + closeVolume + liquidateVolume;
        
        // Add platform fees
        const platformFee = parseFloat(daily.platformFee || "0");
        totalFees += platformFee;
      });
    }

    return {
      dailyVolume: totalVolume / 1e18, // Convert from wei
      dailyFees: totalFees / 1e18 // Convert from wei
    };
  } catch (error) {
    console.error(`Error fetching Base data:`, error);
    return {
      dailyVolume: 0,
      dailyFees: 0
    };
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: '2024-09-08',
    },
    [CHAIN.COTI]: {
      fetch: fetchCoti,
      start: '2025-01-01',
    },
  },
};

export default adapter;
