import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from 'axios';

const API_ENDPOINT = "https://flask.tigristrade.info";

interface ApiResponse {
  dailyVolume: number;
  day: number;
  totalVolume: number;
}

const fetchFromAPI = async (chain: Chain, timestamp: number): Promise<ApiResponse[]> => {
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
}

function startOfDayTimestamp(timestamp: number): number {
  const date = new Date(timestamp * 1000); 
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dataPoints = await fetchFromAPI(chain, timestamp);
    dataPoints.forEach(d => d.day += 3600);
    const adjustedTimestamp = startOfDayTimestamp(timestamp);
    const matchingData = dataPoints.find(e => e.day === adjustedTimestamp);

    if (!matchingData) {
      return {
        dailyVolume: '0',
        totalVolume: '0',
        timestamp: adjustedTimestamp
      };
    }

    return {
      dailyVolume: matchingData.dailyVolume.toString(),
      totalVolume: matchingData.totalVolume.toString(),
      timestamp: matchingData.day
    };
  }
}

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