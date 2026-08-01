import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
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

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(`${URL}?date=${options.toTimestamp}`);
  const data: Response = response.data;

  const dailyFees = Number(data.dailyTakerFee) + Number(data.dailyMakerFee);

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-02-18",
};

export default adapter;
