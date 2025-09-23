import { request, gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
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
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees, // All fees go to holders
    dailyVolume: response.dfxdayDatas[0].dailyVolumeUSD,
    dailyProtocolRevenue: "0"
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


  let dailyFees = 0;
  let dailyVolume = 0;

  for (const pairData of response.pairDayDatas) {
    const feeUSD = parseFloat(pairData.feeUSD);
    dailyFees += feeUSD;
    dailyVolume += parseFloat(pairData.volumeUSD);
  }

  // 100% of fees go to liquidity providers and 0% to the protocol
  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyFees.toString(),
    dailyProtocolRevenue: '0', // Protocol takes 0% of fees
    dailyHoldersRevenue: dailyFees.toString(), // LPs get 100% of fees
    dailyVolume: dailyVolume.toString()
  };
}

const fetch = async (options: FetchOptions) => {
  const result = await getDailyFees(options.endTimestamp);
  return {
    dailyFees: result.dailyFees,
    dailyUserFees: result.dailyFees,
    dailyRevenue: result.dailyRevenue,
    dailyHoldersRevenue: result.dailyHoldersRevenue,
    dailyProtocolRevenue: result.dailyProtocolRevenue
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-13', // February 13, 2025
    },
  },
  methodology: {
    Fees: "Fees are collected from users on each trade.",
    HoldersRevenue: "100% of fees go to liquidity providers.",
    Revenue: "0% of fees go to the protocol.",
  }
};

export default adapter;
