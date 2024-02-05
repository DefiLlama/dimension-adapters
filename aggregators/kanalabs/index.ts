import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://stats.kanalabs.io/volume";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dailyVolume = (await fetchURL(`${URL}?chainId=1`)).data;
  return {
    timestamp,
    dailyVolume: dailyVolume.today.volume,
  };
};

// Define the adapter
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      runAtCurrTime: true,
      start: 1695897839,
    },
  },
};

// Export the adapter
export default adapter;
