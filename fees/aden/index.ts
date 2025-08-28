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

const getAdenDailyFeesFromOrderly = async (startOfDay: number) => {
  const dailyStats: DailyStats[] = await httpGet(
    "https://api.orderly.org/md/volume/builder/daily_stats?broker_id=aden"
  );

  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dayStats = dailyStats.find((day) => day.date.startsWith(targetDate));

  const dailyFees = dayStats ? parseFloat(dayStats.builderFee || "0") : 0;

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const getAdenDailyFeesFromAster = async (startOfDay: number) => {
  const response = (await httpGet(
    "https://www.asterdex.com/bapi/futures/v1/public/future/volume/builder/daily_stats/aden"
  )) as {
    data: DailyStats[];
  };

  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dayStats = response.data.find((day) => day.date.startsWith(targetDate));
  const dailyFees = dayStats ? parseFloat(dayStats.builderFee || "0") : 0;

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetch = async (_t: number, _: any, { startOfDay }: FetchOptions) => {
  const responses = await Promise.all([
    getAdenDailyFeesFromOrderly(startOfDay),
    getAdenDailyFeesFromAster(startOfDay),
  ]);

  const totalFees = responses.reduce(
    (acc, curr) => {
      acc.dailyFees += curr.dailyFees;
      acc.dailyRevenue += curr.dailyRevenue;
      acc.dailyProtocolRevenue += curr.dailyProtocolRevenue;
      return acc;
    },
    { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0 }
  );

  return {
    dailyFees: totalFees.dailyFees.toString(),
    dailyRevenue: totalFees.dailyProtocolRevenue.toString(),
    dailyProtocolRevenue: totalFees.dailyProtocolRevenue.toString(),
  };
};

const methodology = {
  Fees: "(Builder Fees collected from both AsterDEX (0.4bps on taker volume) and Orderly Network(0.3 bps on taker volume).",
  Revenue:
    "For AsterDEX, 0.4 bps trading fees on taker volume, 0 on maker volume; For Orderly Network, 0.3 bps trading fees on taker volume, 0 on maker volume",
  ProtocolRevenue:
    "0.4 bps trading fees on taker volume as builder fee from AsterDEX, while 0.3 bps trading fees on taker volume as builder fee from orderly network",
};

const adapter: SimpleAdapter = {
  fetch,
  // ADEN operates on Solana, Arbitrum, and BNB Chain through Orderly Network
  // Using BNB Chain as the main chain since the API aggregates all chains data
  chains: [CHAIN.BSC],
  start: "2025-07-23",
  methodology,
};

export default adapter;
