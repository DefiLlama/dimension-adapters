import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://indexer.spot.arcus.xyz/stats/daily";
// Robinhood Chain, the only chain the Arcus spot indexer covers.
const ROBINHOOD_CHAIN_ID = 4663;

// Indexer serves only trailing-day windows (max 365), so request enough to reach the date.
export const fetchSpotStats = async (options: FetchOptions) => {
  const days = Math.min(365, Math.ceil((Date.now() / 1000 - options.startOfDay) / 86400) + 1);
  const { rows } = await fetchURL(`${API}?chainId=${ROBINHOOD_CHAIN_ID}&days=${days}`);
  const row = rows?.find((r: any) => r.date === options.dateString);
  if (!row) throw new Error(`No Arcus spot activity data for ${options.dateString}`);
  return row;
};

const fetch = async (options: FetchOptions) => {
  const row = await fetchSpotStats(options);
  return {
    dailyActiveUsers: row.activeAddresses,
    dailyTransactionsCount: row.transactions,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-29",
};

export default adapter;
