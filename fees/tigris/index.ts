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
  totalVolume: number;
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

      // Find the closest data point to the requested timestamp
      let closestData: ApiResponse | null = null;
      let minDifference = Number.MAX_SAFE_INTEGER;
      for (const data of dataPoints) {
        const difference = Math.abs(data.day - timestamp);
        if (difference < minDifference) {
          closestData = data;
          minDifference = difference;
        }
      }

      if (!closestData) {
        throw new Error("No close data point found");
      }

      const data = closestData;

      // Guard Clauses
      if (!data) {
        throw new Error("Data is undefined");
      }

      if (typeof data.dailyFees !== "number" ||
          typeof data.dailyRevenue !== "number" ||
          typeof data.dailyProtocolRevenue !== "number" ||
          typeof data.dailyHoldersRevenue !== "number" ||
          typeof data.day !== "number") {
        console.error("Unexpected data structure:", data);
        throw new Error("API returned unexpected data structure");
      }

      // Explicit Logging
      console.log("dailyFees:", data.dailyFees);
      console.log("dailyRevenue:", data.dailyRevenue);
      console.log("dailyProtocolRevenue:", data.dailyProtocolRevenue);
      console.log("dailyHoldersRevenue:", data.dailyHoldersRevenue);
      console.log("day:", data.day);

      return {
        dailyFees: data.dailyFees.toString(),
        dailyRevenue: data.dailyRevenue.toString(),
        dailyProtocolRevenue: data.dailyProtocolRevenue.toString(),
        dailyHoldersRevenue: data.dailyHoldersRevenue.toString(),
        timestamp: data.day
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

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






