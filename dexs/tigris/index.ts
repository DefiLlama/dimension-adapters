import { Chain } from "@defillama/sdk/build/general";
import type { SimpleAdapter } from "../../adapters/types";
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

const fetchDex = (chain: Chain) => {
    return async (timestamp: number) => {
      try {
        const dataPoints = await fetchFromAPI(chain, timestamp);
        dataPoints.forEach(d => d.day += 3600);
        const adjustedTimestamp = startOfDayTimestamp(timestamp);
        const matchingData = dataPoints.find(e => e.day === adjustedTimestamp);
  
        if (!matchingData) {
          return {
            timestamp: adjustedTimestamp,
            dailyVolume: '0',
            totalVolume: '0'
          };
        }
  
        return {
          timestamp: matchingData.day,
          dailyVolume: matchingData.dailyVolume.toString(),
          totalVolume: matchingData.totalVolume.toString()
        }
      } catch (e) {
        console.error(e);
        throw e;
      }
    }
  }
  