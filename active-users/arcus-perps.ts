import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/stats/perp/activity/daily";

const fetch = async (options: FetchOptions) => {
  const { rows } = await fetchURL(`${API}?from=${options.dateString}&to=${options.dateString}`);
  const row = rows?.find((r: any) => r.date === options.dateString);
  if (!row) throw new Error(`No Arcus perp activity data for ${options.dateString}`);

  return {
    dailyActiveUsers: row.activeAddresses,
    dailyTransactionsCount: row.transactions,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // Through 2026-07-01 the endpoint counts pre-launch system transactions
  // (June reports 14k-27k transactions against 0 active addresses, and
  // 2026-07-01 reports 30248 against 25). 2026-07-02 is the first user-only day.
  start: "2026-07-02",
};

export default adapter;
