import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.happytrading.global/v2/global-stats";

interface Response {
  date: number;
  dailyVolume: string;
  totalVolume: string;
}

const fetch = async (timestamp: number) => {
  const response = await httpGet(`${URL}?date=${timestamp}`);
  const data: Response = response.data;

  const dailyVolume = data.dailyVolume;
  const totalVolume = data.totalVolume;

  return {
    dailyVolume: dailyVolume.toString(),
    totalVolume: totalVolume.toString(),
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
