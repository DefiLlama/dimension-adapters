import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const startTime = 1723478400; // August 13, 2025
const chains = [CHAIN.SOLANA, CHAIN.ARBITRUM, CHAIN.BSC];

interface DailyStats {
  date: string;
  takerVolume: string;
  makerVolume: string;
  builderFee: string;
}

const fetch = async (_t: number, _: any, { startOfDay }: FetchOptions) => {
  const dailyStats: DailyStats[] = await httpGet(
    "https://api.orderly.org/md/volume/builder/daily_stats?broker_id=aden"
  );

  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dayStats = dailyStats.find((day) => 
    day.date.startsWith(targetDate)
  );

  const dailyFees = dayStats ? parseFloat(dayStats.builderFee || "0") : 0;

  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyFees.toString(),
    dailyProtocolRevenue: dailyFees.toString(),
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: startTime,
      },
    };
  }, {}),
};

export default adapter;