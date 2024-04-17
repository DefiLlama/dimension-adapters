import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ILyraVolumeResponse {
  daily_premium_volume: string;
  total_premium_volume: string;
}

// endTime is in nanoseconds
export const lyraVolumeEndpoint = (endTime: number) => {
  return (
    "https://api.lyra.finance/public/statistics?instrument_name=PERP&end_time=" +
    endTime
  );
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchLyraVolumeData,
      start: 1702630075,
    },
  },
};

export async function fetchLyraVolumeData(
  timestamp: number
) {
  let timestamp_in_ms = timestamp * 1000
  const lyraVolumeData = await getLyraVolumeData(lyraVolumeEndpoint(timestamp_in_ms));
  const dailyVolume = Number(lyraVolumeData.daily_premium_volume).toFixed(2);
  const totalVolume = Number(lyraVolumeData.total_premium_volume).toFixed(2);

  return {
    timestamp,
    dailyVolume,
    totalVolume,
  };
}

async function getLyraVolumeData(
  endpoint: string
): Promise<ILyraVolumeResponse> {
  const results = await fetchURL(endpoint)
  return results.result;
}

export default adapter;
