import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

interface IAevoVolumeResponse {
  daily_volume: string;
  daily_volume_premium: string;
  total_volume: string;
  total_volume_premium: string;
}

// endTime is in nanoseconds
export const aevoVolumeEndpoint = (endTime: number) => {
  return "https://api.aevo.xyz/statistics?instrument_type=OPTION&end_time=" + endTime;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchAevoVolumeData,
      start: '2023-04-14'
    },
  },
};

export async function fetchAevoVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const timestampInNanoSeconds = dayTimestamp * 1e9
  const aevoVolumeData = await getAevoVolumeData(aevoVolumeEndpoint(timestampInNanoSeconds));

  const dailyNotionalVolume = Number(aevoVolumeData.daily_volume).toFixed(2);
  const dailyPremiumVolume =  Number(aevoVolumeData.daily_volume_premium).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getAevoVolumeData(endpoint: string): Promise<IAevoVolumeResponse> {
  return (await fetchURL(endpoint));
}

export default adapter;
