import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';

const API_ENDPOINT = "http://127.0.0.1:5000";

interface ApiResponse {
  dailyFees: string;
  dailyRevenue: string;
  dailyProtocolRevenue: string;
  dailyHoldersRevenue: string;
  day: number;  // Changed 'timestamp' to 'day'
}

const fetchFromAPI = async (chain: Chain, timestamp: number): Promise<ApiResponse> => {
  try {
    const response = await axios.get(`${API_ENDPOINT}/fees`, {
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
      const data = await fetchFromAPI(chain, timestamp);
      return {
        dailyFees: data.dailyFees,
        dailyRevenue: data.dailyRevenue,
        dailyProtocolRevenue: data.dailyProtocolRevenue,
        dailyHoldersRevenue: data.dailyHoldersRevenue,
        timestamp: data.day  // We're still getting 'day' from the API, but assigning it to 'timestamp' here
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}


const adapter: Adapter = {
  adapter
  : {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1663023600, // Adjust this to the actual starting timestamp for ARBITRUM
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1663023600, // Adjust this to the actual starting timestamp for POLYGON
    }
  }
}

export default adapter;
