import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {
  const data = await  httpGet('https://supply.elys.network/stats/daily-volume')

  let dailyVolume = 0
  data.forEach((item: any) => {
    if (item.date.slice(0, 10) === dateString) dailyVolume += item.volume
  })

  return { dailyVolume, }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELYS]: {
      fetch,
      start: "2024-12-22",
    },
  },
};

export default adapter;
