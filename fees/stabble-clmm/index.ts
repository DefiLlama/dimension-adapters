import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const feesURL = "https://mclmm-api.stabble.org/protocol-metrics";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const startDate = new Date(options.startTimestamp * 1000).toISOString().split('T')[0];
  const endDate = new Date(options.endTimestamp * 1000).toISOString().split('T')[0];
  const url = `${feesURL}?startTimestamp=${startDate}&endTimestamp=${endDate}`;
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
      start: '2025-12-12',
    },
  },
};

export default adapter;
