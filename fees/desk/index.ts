import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.happytrading.global/v2/global-stats";

interface Response {
  date: number;
  dailyTakerFee: number;
  dailyMakerFee: number;
  totalTakerFee: number;
  totalMakerFee: number;
}

const fetch = async (timestamp: number) => {
  const response = await httpGet(`${URL}?date=${timestamp}`);
  const data: Response = response.data;

  const dailyFees = data.dailyTakerFee + data.dailyMakerFee;
  const totalFees = data.totalTakerFee + data.totalMakerFee;

  return {
    dailyFees: dailyFees.toString(),
    totalFees: totalFees.toString(),
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    desk: {
      fetch,
      start: "2025-02-18",
    },
  },
};

export default adapter;
