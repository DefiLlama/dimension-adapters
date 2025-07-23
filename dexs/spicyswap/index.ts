import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = "https://spicya.sdaotools.xyz/api/rest/SpicyDailyMetrics";

interface IResponse {
  dailyvolumeusd: number;
  day: string;
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const response = (await fetchURL(url)).spicy_day_data as IResponse[];
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const dailyVolume = response.find(item => item.day.split(" ")[0].trim() === dateString)?.dailyvolumeusd

  return {
    dailyVolume: dailyVolume,
    timestamp
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetchVolume,
      start: '2023-07-08'
    }
  }
}
export default adapters;
