import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const API_URL = "https://titan.exchange/public/hourly-volume";

//https://dune.com/queries/5450215/8891846
const badDataDays = [
  {
    date: "2026-04-26",
    realVolume: 56900000
  }
]

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const realVolume = badDataDays.find(day => day.date === options.dateString)?.realVolume;
  if (realVolume) {
    return { dailyVolume: realVolume };
  }
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const result = await fetchURL(url);
  
  // Sum hourly volumes for the exact timestamp range
  const totalVolume = result.data.reduce((sum: number, hour: any) => {
    return sum + Number(hour.volume_usd);
  }, 0);
  
  return { dailyVolume: totalVolume };
};

const adapter: any = {
  version: 1,
  fetch,
  start: '2025-09-18',
  chains: [CHAIN.SOLANA],
};

export default adapter;
