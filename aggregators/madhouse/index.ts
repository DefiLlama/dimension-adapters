import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(`https://stats-api.madhouse.ag/volume?chainId=143`);

  // Data format: { "2025-11-24": 60.32 }
  // Get the date string for the current day
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const dailyVolume = data?.[dateStr] || 0;

  return {
    dailyVolume,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-23',
    },
  },
};

export default adapter;
