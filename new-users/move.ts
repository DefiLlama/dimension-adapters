import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Source: intercepted request from https://explorer.movementnetwork.xyz/analytics.
const STATS_URL = "https://storage.googleapis.com/explorer_stats/chain_stats_mainnet_v2.json";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(STATS_URL);
  const users = data.daily_new_accounts_created.find((row: any) => row.date === options.dateString);

  if (!users) throw new Error(`No Movement new account stats found for ${options.dateString}`);

  return {
    dailyNewUsers: users.new_account_count,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MOVE],
  protocolType: ProtocolType.CHAIN,
  start: "2026-05-10",
};

export default adapter;
