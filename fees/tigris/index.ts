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

function startOfDayTimestamp(timestamp: number): number {
    const date = new Date(timestamp * 1000); 
    date.setUTCHours(0, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const dataPoints = await fetchFromAPI(chain, timestamp);
      dataPoints.forEach(d => d.day += 3600);

      const adjustedTimestamp = startOfDayTimestamp(timestamp);
      
      console.log("Adjusted Timestamp:", adjustedTimestamp);
      console.log("Days in fetched data:", dataPoints.map(d => d.day));

      const matchingData = dataPoints.find(e => e.day === adjustedTimestamp);

      if (!matchingData) {
        console.warn(`No matching data found for timestamp ${adjustedTimestamp}. Returning zero values.`);
        return {
          dailyFees: '0',
          dailyRevenue: '0',
          dailyProtocolRevenue: '0',
          dailyHoldersRevenue: '0',
          timestamp: adjustedTimestamp,
          totalFees: '0'
        };
      }

      return {
        dailyFees: matchingData.dailyFees.toString(),
        dailyRevenue: matchingData.dailyRevenue.toString(),
        dailyProtocolRevenue: matchingData.dailyProtocolRevenue.toString(),
        dailyHoldersRevenue: matchingData.dailyHoldersRevenue.toString(),
        timestamp: matchingData.day,
        totalFees: matchingData.totalFees.toString()
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

