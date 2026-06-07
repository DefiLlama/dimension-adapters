import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async ({ dateString }: FetchOptions) => {
  const perpData = await  httpGet('https://supply.elys.network/stats/daily-perp-volume')

  let dailyVolume = 0
  perpData.forEach((item: any) => {
    if (item.date.slice(0, 10) === dateString) dailyVolume += item.total_volume
  })

  return { dailyVolume, }
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ELYS],
  start: "2024-12-22",
};

export default adapter;
