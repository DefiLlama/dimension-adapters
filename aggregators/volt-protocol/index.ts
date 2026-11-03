import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STATS_URL = "https://voltswap.org/api/stats";

const fetch = async (): Promise<FetchResult> => {
  const data = await fetchURL(STATS_URL);
  return {
    dailyVolume: data.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: '2026-11-01',
    },
  },
};

export default adapter;
