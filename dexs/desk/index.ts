import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.happytrading.global/v2/global-stats";

interface Response {
  date: number;
  dailyVolume: string;
}

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(`${URL}?date=${options.toTimestamp}`);
  const data: Response = response.data;

  const dailyVolume = data.dailyVolume;

  return {
    dailyVolume: dailyVolume.toString(),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-02-18",
};

export default adapter;
