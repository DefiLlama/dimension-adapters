import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchSpotStats } from "../active-users/arcus-spot";

const fetch = async (options: FetchOptions) => {
  const row = await fetchSpotStats(options);
  return {
    dailyNewUsers: row.newAddresses,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-29",
};

export default adapter;
