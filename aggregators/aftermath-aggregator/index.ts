import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://aftermath.finance/api/router/volume-24hrs";

const fetch = async (): Promise<FetchResult> => {
  const dailyVolume =     await fetchURL(URL)

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-07-20'
    },
  },
};

export default adapter;
