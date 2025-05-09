import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://api.stabble.org/metric";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(
    options.endTimestamp
  );

  const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: DailyStats = await fetchURL(url);

  return {
    timestamp: dayTimestamp,
    dailyVolume: stats.volume,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-06-05',
    },
  },
};

export default adapter;
