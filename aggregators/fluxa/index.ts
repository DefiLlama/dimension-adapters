import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://api-fluxa.capylabs.io/api/v1";

const fetch = async (options: FetchOptions) => {
  const url = `${BASE_URL}/transactions/daily-total-volume?startTimestamp=${options.startTimestamp * 1000 }&endTimestamp=${options.endTimestamp * 1000}`;

  const res = await fetchURL(url);

  return {
    dailyVolume: res.totalDailyVolumeUsd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SEI],
  start: "2025-10-12",
};

export default adapter;
