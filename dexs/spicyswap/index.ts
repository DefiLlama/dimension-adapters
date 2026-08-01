import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = "https://spicya.sdaotools.xyz/api/rest/SpicyDailyMetrics";

interface IResponse {
  dailyvolumeusd: number;
  day: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const response = (await fetchURL(url)).spicy_day_data as IResponse[];
  const dailyVolume = response.find(item => item.day.split(" ")[0].trim() === options.dateString)?.dailyvolumeusd

  return { dailyVolume }
}
const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TEZOS],
  start: '2023-07-08',
}

export default adapter;
