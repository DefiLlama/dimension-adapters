import type { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.happytrading.global/v2/global-stats";

interface Response {
  date: number;
  dailyTakerFee: string;
  dailyMakerFee: string;
  totalTakerFee: string;
  totalMakerFee: string;
}

const fetch = async (timestamp: number) => {
  const response = await httpGet(`${URL}?date=${timestamp}`);
  const data: Response = response.data;

  const dailyFees = Number(data.dailyTakerFee) + Number(data.dailyMakerFee);

  return {
    dailyFees,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-02-18",
    },
  },
};

export default adapter;
