import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/stats/perp/activity/daily";

const fetch = async (options: FetchOptions) => {
  const { rows } = await fetchURL(`${API}?from=${options.dateString}&to=${options.dateString}`);
  const row = rows?.find((r: any) => r.date === options.dateString);
  if (!row) throw new Error(`No Arcus perp activity data for ${options.dateString}`);

  return {
    dailyNewUsers: row.newAddresses,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-01",
};

export default adapter;
