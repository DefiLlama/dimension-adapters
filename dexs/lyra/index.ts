import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

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
  fetch: fetchLyraVolumeData,
  chains: [CHAIN.LYRA],
  start: '2023-12-15',
};

export async function fetchLyraVolumeData(options: FetchOptions) {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(options.toTimestamp);
  const timestamp_in_ms = dayTimestamp * 1000
  const lyraVolumeData = await getLyraVolumeData(lyraVolumeEndpoint(timestamp_in_ms));
  const dailyVolume = Number(lyraVolumeData.daily_premium_volume).toFixed(2);

  return {
    dailyVolume,
  };
}

async function getLyraVolumeData(
  endpoint: string
): Promise<ILyraVolumeResponse> {
  const results = await fetchURL(endpoint)
  return results.result;
}

export default adapter;
