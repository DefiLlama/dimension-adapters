import fetchURL from "../../utils/fetchURL";
import { Chain, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IVolumeData {
  volume: number;
  timestamp: number;
}

interface IApiResponse {
  data: IVolumeData[];
  startTimestamp: number;
  endTimestamp: number;
  totalPoints: number;
}

const META = { 
  methodology: {
    dailyVolume: "Volume data is fetched from Renegade.fi's API endpoints for each supported chain.",
  }
};

const historicalVolumeEndpoint = (chain: Chain) => {
  const chainId = {
    [CHAIN.ARBITRUM]: "42161",
    [CHAIN.BASE]: "8453",
  }[chain];
  if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
  return `https://trade.renegade.fi/api/stats/historical-volume-kv?chainId=${chainId}`;
};

const fetchData = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const startOfDay = getTimestampAtStartOfDayUTC(timestamp);
    const historicalVolume: IApiResponse = await fetchURL(historicalVolumeEndpoint(chain));
    let dailyVolume = 0, totalVolume = 0;
    
    for (const record of historicalVolume.data) {
      if (record.timestamp === startOfDay) {
        dailyVolume = record.volume;
      }
      totalVolume += record.volume;
    }
    
    return {
      dailyVolume,
      totalVolume,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchData(CHAIN.ARBITRUM),
      start: "2024-09-03",
      meta: META,
    },
    [CHAIN.BASE]: {
      fetch: fetchData(CHAIN.BASE),
      start: "2025-05-29",
      meta: META,
    },
  },
  version: 1,
};

export default adapter; 