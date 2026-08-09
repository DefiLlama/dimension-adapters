import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/stats/perp/activity/daily";

export const fetchPerpStats = async (options: FetchOptions) => {
  const { rows } = await fetchURL(`${API}?from=${options.dateString}&to=${options.dateString}`);
  const row = rows?.find((r: any) => r.date === options.dateString);
  if (!row) throw new Error(`No Arcus perp activity data for ${options.dateString}`);
  return row;
};

const fetch = async (options: FetchOptions) => {
  const row = await fetchPerpStats(options);
  return {
    dailyActiveUsers: row.activeAddresses,
    dailyTransactionsCount: row.transactions,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // Endpoint counts pre-launch system txs through 2026-07-01 (30248 txs vs 25 users).
  start: "2026-07-02",
};

export default adapter;
