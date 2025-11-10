import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const API_URL = "https://titan.exchange/public/daily-volume";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  
  // Convert timestamps to YYYY-MM-DD format
  const startDate = new Date(options.startTimestamp * 1000).toISOString().split('T')[0];
  const endDate = new Date(options.endTimestamp * 1000).toISOString().split('T')[0];
  
  const url = `${API_URL}?start_date=${startDate}&end_date=${endDate}`;
  
  const result = await fetchURL(url);
  
  // Sum up volume for the date range
  const totalVolume = result.data.reduce((sum: number, day: any) => {
    return sum + Number(day.volume_usd);
  }, 0);
  
  return {
    dailyVolume: totalVolume
  };
};

const adapter: any = {
  version: 1,
  fetch,
  start: '2025-09-18',
  chains: [CHAIN.SOLANA],
};

export default adapter;
