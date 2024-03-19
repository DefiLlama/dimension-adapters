import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ILyraVolumeResponse {
  daily_notional_volume: string;
  daily_premium_volume: string;
  total_notional_volume: string;
  total_premium_volume: string;
}

// endTime is in ms
export const lyraVolumeEndpoint = (endTime: number) => {
  return "https://api.lyra.finance/public/statistics?instrument_name=OPTION&end_time=" + endTime;
}

export const v2_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchLyraVolumeData,
      start: 1702630075
    },
  },
};

export async function fetchLyraVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  let timestamp_in_ms = timestamp * 1000
  const lyraVolumeData = await getLyraVolumeData(lyraVolumeEndpoint(timestamp_in_ms));

  const dailyNotionalVolume = Number(lyraVolumeData.daily_notional_volume).toFixed(2);
  const dailyPremiumVolume =  Number(lyraVolumeData.daily_premium_volume).toFixed(2);
  const totalNotionalVolume = Number(lyraVolumeData.total_notional_volume).toFixed(2);
  const totalPremiumVolume = Number(lyraVolumeData.total_premium_volume).toFixed(2);

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
    totalNotionalVolume,
    totalPremiumVolume,
  };
}

async function getLyraVolumeData(endpoint: string): Promise<ILyraVolumeResponse> {
  const results = await fetchURL(endpoint)
  return results.result;
}

export default v2_adapter;
