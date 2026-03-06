import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const START = "2025-10-15";

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getNextDate(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function fetchStats(dateString: string): Promise<{ volume: number; fees: number }> {
  const endpointWithDate = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${dateString}&broker=aden`;
  const data = await fetchURL(endpointWithDate);

  if (!data) throw new Error("Data missing for date: " + dateString);

  return {
    volume: Number((data as any).volume || 0),
    fees: Number((data as any).fees || 0),
  };
}

async function fetchGateData(dateString: string) {
  const dailyStats = await fetchStats(dateString);

  let totalVolume = 0;
  let totalFees = 0;
  let currentDate = START;

  while (currentDate <= dateString) {
    const stats = await fetchStats(currentDate);
    totalVolume += stats.volume;
    totalFees += stats.fees;
    currentDate = getNextDate(currentDate);
  }

  return {
    dailyVolume: dailyStats.volume,
    totalVolume,
    dailyFees: dailyStats.fees,
    totalFees,
  };
}

const methodology = {};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.GATE_LAYER]: {
      start: START,
      fetch: async (_: any, _1: any, options: FetchOptions) => {
        const dateString = options.dateString ?? formatDate(options.fromTimestamp);
        return fetchGateData(dateString);
      },
    },
  },
  methodology,
};

export default adapter;
