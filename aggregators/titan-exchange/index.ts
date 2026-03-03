import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const API_URL = "https://titan.exchange/public/hourly-volume";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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
