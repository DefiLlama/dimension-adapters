import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://stats.kanalabs.io/volume";

const fetch = async (): Promise<any> => {
  const dailyVolume = (await fetchURL(`${URL}?chainId=1`)).data.data;

  return {
    last7Days: {
      volume: dailyVolume.last7Days.volume,
    },
    last30Days: {
      volume: dailyVolume.last30Days.volume,
    },
    today: {
      volume: dailyVolume.today.volume,
    },
  };
};

// Define the adapter
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: async () => 1689811210,
    },
  },
};

// Export the adapter
export default adapter;
