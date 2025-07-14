import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const URL = "https://api.cobaltx.io/main/info";

const fetch = async (): Promise<FetchResult> => {
  const response = await fetchURL(URL);
  return {
    dailyVolume: response.data.volume24,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOON]: {
      fetch,
      runAtCurrTime: true
    },
  },
};

export default adapter;
