import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const BASE_URL = "https://api-fluxa.capylabs.io/api/v1";

const fetch = async ({ fromTimestamp, toTimestamp }: FetchOptions) => {
  const url = `${BASE_URL}/transactions/daily-total-volume?startTimestamp=${
    fromTimestamp * 1000
  }&endTimestamp=${toTimestamp * 1000}`;

  const res = await httpGet(url);
  return {
    dailyVolume: res.totalDailyVolumeUsd,
  };
};

const adapter: any = {
  version: 2,
  deadFrom: "2025-10-12",
  adapter: {
    [CHAIN.SEI]: {
      fetch: fetch,
      start: "2025-10-13",
    },
  },
};

export default adapter;
