import { Chain } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://flask.tigristrade.info";

interface ApiResponse {
  dailyNotionalVolume: number;
  day: number;
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

  const response = await httpGet(`${API_ENDPOINT}${endpoint}`, {
    params: {
      chain: chain,
      timestamp: timestamp
    }
  });

  return response;
}

function startOfDayTimestamp(timestamp: number): number {
  const date = new Date(timestamp * 1000);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dataPoints = await fetchFromAPI(chain, timestamp);

    const adjustedTimestamp = startOfDayTimestamp(timestamp);

    const matchingData = dataPoints.find(e => e.day === adjustedTimestamp);

    if (!matchingData)
      throw new Error(`No matching data found for timestamp ${adjustedTimestamp}. Returning zero values.`);

    return {
      dailyPremiumVolume: '0',
      dailyNotionalVolume: matchingData.dailyNotionalVolume.toString(),
      timestamp: matchingData.day
    };
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2022-09-13',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2022-09-13',
    }
  }
}

export default adapter;
