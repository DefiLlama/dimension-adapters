import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from 'axios';

const API_ENDPOINT = "http://127.0.0.1:5000";

interface ApiResponse {
  dailyFees: number;
  dailyNotionalVolume: number;
  dailyVolume: number;
  day: number;
  totalFees: number;
  totalNotionalVolume: number;
  dailyRevenue: number;
  dailyHoldersRevenue: number;
  dailyProtocolRevenue: number;
}

const fetchFromAPI = async (chain: Chain, timestamp: number): Promise<ApiResponse[]> => {
  try {
    let endpoint;
    if (chain === CHAIN.POLYGON) {
      endpoint = "/fetch-polygon-data";
    } else if (chain === CHAIN.ARBITRUM) {
      endpoint = "/fetch-arbitrum-data";
    } else {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const response = await axios.get(`${API_ENDPOINT}${endpoint}`, {
      params: {
        chain: chain,
        timestamp: timestamp
      }
    });

    if (response.status !== 200) {
      throw new Error("Failed to fetch data from the API");
    }

    return response.data;
  } catch (error) {
    console.error("Error fetching from the API:", error);
    throw error;
  }
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const dataPoints = await fetchFromAPI(chain, timestamp);

      // First, try to find an exact match
      const matchingData = dataPoints.find(e => e.day === timestamp);

      if (matchingData) {
        return {
          dailyFees: matchingData.dailyFees.toString(),
          dailyRevenue: matchingData.dailyRevenue.toString(),
          dailyProtocolRevenue: matchingData.dailyProtocolRevenue.toString(),
          dailyHoldersRevenue: matchingData.dailyHoldersRevenue.toString(),
          timestamp: matchingData.day,
          totalFees: matchingData.totalFees.toString()
        };
      } else {
        // If no exact match, find the closest data point
        let closestData: ApiResponse | null = null;
        let minDifference = Number.MAX_SAFE_INTEGER;
        for (const data of dataPoints) {
          const difference = Math.abs(data.day - timestamp);
          if (difference < minDifference) {
            closestData = data;
            minDifference = difference;
          }
        }

        if (closestData) {
          console.warn(`Using closest data point for timestamp ${timestamp}. Closest match: ${closestData.day}`);
          return {
            dailyFees: closestData.dailyFees.toString(),
            dailyRevenue: closestData.dailyRevenue.toString(),
            dailyProtocolRevenue: closestData.dailyProtocolRevenue.toString(),
            dailyHoldersRevenue: closestData.dailyHoldersRevenue.toString(),
            timestamp: closestData.day,
            totalFees: closestData.totalFees.toString()
          };
        } else {
          throw new Error("No matching or close data found for the given timestamp");
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };
};


const testFetch = async () => {
  console.log("Testing Arbitrum Fetch:");
  try {
    const arbitrumData = await fetchFromAPI(CHAIN.ARBITRUM, 1663023600);
    console.log("Arbitrum Data:", arbitrumData);
  } catch (err) {
    console.error("Error fetching Arbitrum data:", err);
  }

  console.log("\nTesting Polygon Fetch:");
  try {
    const polygonData = await fetchFromAPI(CHAIN.POLYGON, 1663023600);
    console.log("Polygon Data:", polygonData);
  } catch (err) {
    console.error("Error fetching Polygon data:", err);
  }
}

testFetch();

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1663023600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1663023600,
    }
  }
}

export default adapter;







