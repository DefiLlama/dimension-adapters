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

const getAdenDailyVolumeFromOrderly = async (startOfDay: number) => {
  const dailyStats: DailyStats[] = await httpGet(
    "https://api.orderly.org/md/volume/builder/daily_stats?broker_id=aden"
  );

  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dayStats = dailyStats.find((day) => day.date.startsWith(targetDate));
  if (!dayStats) {
    throw new Error(`No stats found for date: ${targetDate}`);
  }

  return parseFloat(dayStats.takerVolume || "0");
};

const getAdenDailyVolumeFromAster = async () => {
  const response = await httpGet(
    "https://www.asterdex.com/fapi/v1/aden/ticker/24hr"
  );

  return response.reduce(
    (acc: number, c: { quoteVolume: string }) =>
      acc + parseFloat(c.quoteVolume),
    0
  );
};

const fetch = async (_t: number, _: any, { startOfDay }: FetchOptions) => {
  const responses = await Promise.all([
    getAdenDailyVolumeFromOrderly(startOfDay),
    getAdenDailyVolumeFromAster(),
  ]);

  return {
    dailyVolume: responses.reduce(
      (acc: number, dailyVolume) => acc + dailyVolume,
      0
    ),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  // ADEN operates on Solana, Arbitrum, and BNB Chain through Orderly Network
  // Using BNB Chain as the main chain since the API aggregates all chains data
  chains: [CHAIN.BSC],
  start: "2025-07-23",
};

export default adapter;
