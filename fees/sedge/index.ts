import { request, gql } from "graphql-request";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Subgraph endpoint for Sedge (formerly DFX Finance) on Base
const endpoint = "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/amm-v3-base/latest/gn";

const headers = {
  'origin': 'https://sedge.so/',
  'referer': 'https://sedge.so/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};

// Calculate fees from the DFXDayData entity
async function getDailyFees(timestamp: number) {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  
  const query = gql`
    query getFees($dayTimestamp: Int!) {
      dfxdayDatas(where: { date: $dayTimestamp }) {
        dailyFeeUSD
        dailyVolumeUSD
      }
    }
  `;

  const response = await request(endpoint, query, {
    dayTimestamp
  }, headers);

  // Check if we have data for the requested day
  if (!response.dfxdayDatas || response.dfxdayDatas.length === 0) {
    // Fallback: query for specific pairs data if DFXDayData is not available
    return await getPairsDailyFees(timestamp);
  }

  // Calculate total daily fees
  const dailyFees = response.dfxdayDatas[0].dailyFeeUSD;
  
  // Based on the subgraph data, all pairs have protocolFee of 0
  // This means 100% of fees go to liquidity providers and 0% to the protocol
  
  return {
    dailyFees,
    dailyRevenue: "0", // Protocol revenue is 0
    dailyHoldersRevenue: dailyFees, // All fees go to holders
    dailyVolume: response.dfxdayDatas[0].dailyVolumeUSD
  };
}

// Fallback method: Calculate fees by summing individual pair data
async function getPairsDailyFees(timestamp: number) {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400; // Start of the day (UTC)
  
  const query = gql`
    query getPairFees($dayTimestamp: Int!) {
      pairDayDatas(
        where: { date: $dayTimestamp }
      ) {
        feeUSD
        volumeUSD
        pair {
          protocolFee
        }
      }
    }
  `;

  const response = await request(endpoint, query, {
    dayTimestamp
  }, headers);

  if (!response.pairDayDatas || response.pairDayDatas.length === 0) {
    return {
      dailyFees: "0",
      dailyRevenue: "0",
      dailyHoldersRevenue: "0",
      dailyVolume: "0"
    };
  }

  let totalFees = 0;
  let totalVolume = 0;

  for (const pairData of response.pairDayDatas) {
    const feeUSD = parseFloat(pairData.feeUSD);
    totalFees += feeUSD;
    totalVolume += parseFloat(pairData.volumeUSD);
  }

  // 100% of fees go to liquidity providers and 0% to the protocol
  return {
    dailyFees: totalFees.toString(),
    dailyRevenue: "0", // Protocol takes 0% of fees
    dailyHoldersRevenue: totalFees.toString(), // LPs get 100% of fees
    dailyVolume: totalVolume.toString()
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: async ({ endTimestamp }) => {
        const result = await getDailyFees(endTimestamp);
        return {
          dailyFees: result.dailyFees,
          dailyRevenue: result.dailyRevenue,
          dailyHoldersRevenue: result.dailyHoldersRevenue,
        };
      },
      start: 1739404800, // February 13, 2025
    },
  },
  version: 2,
};

export default adapter;
