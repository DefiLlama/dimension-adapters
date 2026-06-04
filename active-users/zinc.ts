import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneResult } from "../helpers/dune";

const ACTIVE_PLAYERS_QUERY_ID = "7638215";

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneResult(options, ACTIVE_PLAYERS_QUERY_ID);
  const row = rows.find((item: { day?: string }) => String(item.day).slice(0, 10) === options.dateString);

  return {
    dailyActiveUsers: row?.active_players ?? 0,
    dailyTransactionsCount: row?.rounds_deployed ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2026-05-24",
};

export default adapter;
