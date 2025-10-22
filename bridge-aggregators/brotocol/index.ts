import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

interface ApiResponse {
  day: string;
  volume: number;
}

const api = "https://api.brotocol.xyz/v1/xlink/bridge-volume-by-day"

const fetch = async (options: FetchOptions) => {
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const data: ApiResponse = await fetchURL(`${api}?day=${dateStr}`)
  return { dailyBridgeVolume: data.volume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    brotocol: {
      fetch,
      start: '2023-04-17'
    }
  }
};

export default adapter;
