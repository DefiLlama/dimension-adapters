import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

// endTime is in ms (optional - when provided, returns stats for that period)
const lyraAllStatisticsEndpoint = (endTime?: number) => {
  const base = "https://api.lyra.finance/public/all_statistics";
  return endTime != null ? `${base}?end_time=${endTime}` : base;
};

export const v2_adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LYRA]: {
      fetch: fetchLyraVolumeData,
      start: '2023-12-15'
    },
  },
};

export async function fetchLyraVolumeData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
) {
  const timestampInMs = timestamp * 1000;
  const data = await fetchURL(lyraAllStatisticsEndpoint(timestampInMs));
  const optionStats = (data.result as Array<{
    instrument_type: string;
    daily_notional_volume: string;
    daily_premium_volume: string;
    total_notional_volume: string;
    total_premium_volume: string;
  }>).filter((entry) => entry.instrument_type?.toLowerCase() === "option");

  let dailyNotionalVolume = "0";
  let dailyPremiumVolume = "0";
  let totalNotionalVolume = "0";
  let totalPremiumVolume = "0";

  for (const entry of optionStats) {
    dailyNotionalVolume = (Number(dailyNotionalVolume) + Number(entry.daily_notional_volume)).toString();
    dailyPremiumVolume = (Number(dailyPremiumVolume) + Number(entry.daily_premium_volume)).toString();
    totalNotionalVolume = (Number(totalNotionalVolume) + Number(entry.total_notional_volume)).toString();
    totalPremiumVolume = (Number(totalPremiumVolume) + Number(entry.total_premium_volume)).toString();
  }

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
    totalNotionalVolume,
    totalPremiumVolume,
  };
}

export default v2_adapter;
