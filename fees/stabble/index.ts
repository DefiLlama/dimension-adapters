import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const feesURL = "https://api.stabble.org/stats/fees";

interface DailyStats {
  revenue: number;
  fees: number;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const url = `${feesURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: DailyStats = await fetchURL(url);

  return {
    dailyFees: stats.fees,
    dailyRevenue: stats.revenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 1717563162,
    },
  },
};

export default adapter;
