import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface DailyStats {
  date: string;
  dateString: string;
  createdAt: string;
  updatedAt: string;
  builderFee: string;
  takerVolume: string;
  makerVolume: string;
  activeUser: number;
}

const fetch = async (_t: number, _: any, { startOfDay }: FetchOptions) => {
  // Using new Orderly API endpoint that provides separate taker/maker volumes
  const dailyStats: DailyStats[] = await httpGet(
    "https://api.orderly.org/md/volume/builder/daily_stats?broker_id=aden"
  );

  // Find the stats for the requested date
  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dayStats = dailyStats.find((day) => 
    day.date.startsWith(targetDate)
  );

  if (!dayStats) {
    return {
      dailyVolume: "0",
      timestamp: startOfDay,
    };
  }

  // Use only taker volume to avoid double counting
  // When ADEN user is taker, the volume is counted
  // This is the standard approach for derivatives exchanges
  const dailyVolume = parseFloat(dayStats.takerVolume || "0");

  return {
    dailyVolume: dailyVolume.toString(),
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    // ADEN operates on Solana, Arbitrum, and BNB Chain through Orderly Network
    // Using Arbitrum as the main chain since the API aggregates all chains data
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-07-23', // ADEN launch date
    },
  },
};

export default adapter;