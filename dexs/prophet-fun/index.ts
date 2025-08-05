
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const URL = "https://backend.prophet.fun/business-metrics/daily-volume"
  const data = await fetchURL(URL + "?timestamp=" + options.startOfDay);

  return {
    dailyVolume: data.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  start: '2025-07-24',
};

export default adapter;
