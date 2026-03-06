import fetchURL from "../utils/fetchURL";
import { Adapter } from "../adapters/types";

const START = "2025-10-15";

async function fetchStats(date: string) {
  const url = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${date}&broker=aden`;

  const { data } = await fetchURL(url);

  return {
    volume: Number(data?.volume ?? 0),
    fees: Number(data?.fees ?? 0),
  };
}

const adapter: Adapter = {
  adapter: {
    gateperps: {
      start: async () => new Date(START).getTime() / 1000,

      fetch: async (timestamp: number) => {
        const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

        const stats = await fetchStats(date);

        return {
          dailyVolume: stats.volume,
          dailyFees: stats.fees,
        };
      },
    },
  },
};

export default adapter;
