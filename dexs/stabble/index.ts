import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://api.stabble.org/metric";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: DailyStats = await fetchURL(url);

  return {
    dailyVolume: stats.volume,
    dailyFees: stats.fees,
    dailyRevenue: stats.revenue
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-06-05',
    },
  },
};

export default adapter;
