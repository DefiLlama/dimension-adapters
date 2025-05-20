import {
  Adapter,
  FetchOptions,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";



const fetchSteammStats = async ({ startTimestamp, endTimestamp, }: FetchOptions) => {
  const url = `https://api.suilend.fi/steamm/historical/volume?startTimestampS=${startTimestamp}&endTimestampS=${endTimestamp}&intervalS=86400`
  const [stats]: any = (await fetchURL(url));

  return {
    dailyVolume: stats.usdValue,
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSteammStats,
      start: '2025-02-16',
    },
  },
};

export default adapter;
