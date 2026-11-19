import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

interface IDeriVolumeResponse {
  daily_volume: string;
  daily_volume_premium: string;
  chain_id?: number;
}

// endTime is in seconds (unix). API also accepts ms / ns.
export const deriVolumeEndpoint = (endTime: number) => {
  return "https://v5dh.deri.io/statistics?instrument_type=OPTION&end_time=" + endTime;
}

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(options.toTimestamp);
  const deriVolumeData = await getDeriVolumeData(deriVolumeEndpoint(dayTimestamp));

  const dailyNotionalVolume = Number(deriVolumeData.daily_volume).toFixed(2);
  const dailyPremiumVolume = Number(deriVolumeData.daily_volume_premium).toFixed(2);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getDeriVolumeData(endpoint: string): Promise<IDeriVolumeResponse> {
  return (await fetchURL(endpoint));
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.DERI_CHAIN]: {
      fetch,
      start: '2026-04-20',
    },
  },
};

export default adapter;
