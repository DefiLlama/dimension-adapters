import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Source: intercepted request from https://explorer.movementnetwork.xyz/analytics.
const STATS_URL = "https://storage.googleapis.com/explorer_stats/chain_stats_mainnet_v2.json";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(STATS_URL);
  const users = data.daily_active_users.find((row: any) => row.date === options.dateString);
  const txs = data.daily_user_transactions.find((row: any) => row.date === options.dateString);
  const gas = data.daily_gas_from_user_transactions.find((row: any) => row.date === options.dateString);

  if (!users || !txs || !gas) throw new Error(`No Movement stats found for ${options.dateString}`);

  return {
    dailyActiveUsers: users.daily_active_user_count,
    dailyTransactionsCount: txs.num_user_transactions,
    dailyGasUsed: gas.gas_cost,
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
