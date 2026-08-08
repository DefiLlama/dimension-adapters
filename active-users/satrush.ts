import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const BASE_URL = "https://api.satrush.io/api/v1/integration/stats/game";

const fetch = async (options: FetchOptions) => {
  const url = `${BASE_URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`;
  const { total_unique_miners_count } = (await fetchURL(url)).data;

  return {
    dailyActiveUsers: total_unique_miners_count,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-02",
};

export default adapter;
