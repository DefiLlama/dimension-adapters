import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { Adapter } from "./../adapters/types";

const stabbleFeesURL = "https://api.stabble.org/stats/fees";

interface DailyStats {
  revenue: number;
  fees: number;
}

const fetch = async () => {
  const url = `${stabbleFeesURL}?type=daily`;
  const stats: DailyStats = await fetchURL(url);

  return {
    dailyFees: stats.fees,
    dailyRevenue: stats.revenue,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
};

export default adapter;
