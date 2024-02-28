import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface IAevoVolumeResponse {
  daily_volume: string;
  total_volume: string;
}

const getUniqEndOfTodayTimestamp = (date = new Date()) => {
  var date_utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
  var endOfDay = new Date(date_utc);
  var timestamp = endOfDay.getTime() / 1000;
  return Math.floor(timestamp / 86400) * 86400;
};

// endTime is in nanoseconds
export const aevoVolumeEndpoint = (endTime: number) => {
  return "https://api.aevo.xyz/statistics?instrument_type=PERPETUAL&end_time=" + endTime;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchAevoVolumeData,
      start: 1681430400
    },
  },
};

export async function fetchAevoVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  const dayTimestamp = getUniqEndOfTodayTimestamp(new Date(timestamp * 1000))
  const url = aevoVolumeEndpoint(dayTimestamp * 1e9)
  const aevoVolumeData = await getAevoVolumeData(url);
  const dailyVolume = Number(aevoVolumeData.daily_volume).toFixed(2);
  const totalVolume = Number(aevoVolumeData.total_volume).toFixed(2);

  return {
    timestamp,
    dailyVolume,
    totalVolume,
  };
}

async function getAevoVolumeData(endpoint: string): Promise<IAevoVolumeResponse> {
  return (await fetchURL(endpoint));
}

export default adapter;
