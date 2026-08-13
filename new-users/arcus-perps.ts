import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchPerpStats } from "../active-users/arcus-perps";

const fetch = async (options: FetchOptions) => {
  const row = await fetchPerpStats(options);
  return {
    dailyNewUsers: row.newAddresses,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // Pre-launch system txs through 2026-07-01, see active-users/arcus-perps.
  start: "2026-07-02",
};

export default adapter;
