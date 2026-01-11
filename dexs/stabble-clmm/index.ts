import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://mclmm-api.stabble.org/protocol-metrics";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(
    options.endTimestamp
  );
  const startDate = new Date(options.startTimestamp * 1000).toISOString().split('T')[0];
  const endDate = new Date(options.endTimestamp * 1000).toISOString().split('T')[0];
  const url = `${volumeURL}?startTimestamp=${startDate}&endTimestamp=${endDate}`;

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
      start: '2025-12-12',
    },
  },
};

export default adapter;
