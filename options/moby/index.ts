import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface IMobyVolumeResponse {
  daily_notional_volume: string;
  daily_premium_volume: string;
  total_notional_volume: string;
  total_premium_volume: string;
}

// endTime is in ms
export const mobyVolumeEndpoint = (endTime: number) => {
  return `https://kv6mtyhua5.execute-api.ap-northeast-2.amazonaws.com/prod/getVolumeData?end_time=${endTime}`;
}

export const moby_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchMobyVolumeData,
      start: 196746973
    },
  },
};

export async function fetchMobyVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  let timestamp_in_ms = timestamp * 1000
  const mobyVolumeData = await getMobyVolumeData(mobyVolumeEndpoint(timestamp_in_ms));

  const dailyNotionalVolume = Number(mobyVolumeData.daily_notional_volume).toFixed(2);
  const dailyPremiumVolume =  Number(mobyVolumeData.daily_premium_volume).toFixed(2);
  const totalNotionalVolume = Number(mobyVolumeData.total_notional_volume).toFixed(2);
  const totalPremiumVolume = Number(mobyVolumeData.total_premium_volume).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
    totalNotionalVolume,
    totalPremiumVolume,
  };
}

async function getMobyVolumeData(endpoint: string): Promise<IMobyVolumeResponse> {
  const results = await fetchURL(endpoint)

  return results.result;
}

export default moby_adapter;
