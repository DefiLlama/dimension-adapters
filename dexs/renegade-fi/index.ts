import fetchURL from "../../utils/fetchURL";
import { Chain, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
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

const historicalVolumeEndpoint = (chain: Chain) => {
  const chainId = {
    [CHAIN.ARBITRUM]: "42161",
    [CHAIN.BASE]: "8453",
  }[chain];
  if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
  return `https://trade.renegade.fi/api/stats/historical-volume-kv?chainId=${chainId}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.toTimestamp);
  const historicalVolume: IApiResponse = await fetchURL(historicalVolumeEndpoint(options.chain));
  let dailyVolume = 0;
  
  for (const record of historicalVolume.data) {
    if (record.timestamp === startOfDay) {
      dailyVolume = record.volume;
    }
  }
  
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-09-03",
    },
    [CHAIN.BASE]: {
      start: "2025-05-29",
    },
  },
};

export default adapter; 