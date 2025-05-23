import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://aftermath.finance/api/pools/volume-24hrs";

const fetch = async (): Promise<FetchResult> => {
  return {
    dailyVolume: await fetchURL(URL)
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-07-20'
    },
  },
};

export default adapter;
