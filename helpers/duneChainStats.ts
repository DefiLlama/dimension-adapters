import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "./dune";

type DuneEvmStatsRow = {
  active_users: number;
  gas_used: number;
  new_users: number;
  tx_count: number;
};

export type DuneChainStatsMode = "active-users" | "new-users";

/** Tracks active users, transactions, and gas from Dune EVM transaction tables. */
export const getDuneEvmActiveUsers = async (options: FetchOptions, table = "CHAIN.transactions") => {
  const [row]: DuneEvmStatsRow[] = await queryDuneSql(options, `
    SELECT
      COUNT(*) AS tx_count,
      COUNT(DISTINCT "from") AS active_users,
      SUM(gas_used) AS gas_used
    FROM ${table}
    WHERE success = true
      AND "from" IS NOT NULL
      AND block_date >= CAST(from_unixtime(${options.startTimestamp}) AS date)
      AND block_date <= CAST(from_unixtime(${options.endTimestamp}) AS date)
      AND block_time > from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `);

  return {
    dailyActiveUsers: row?.active_users ?? 0,
    dailyTransactionsCount: row?.tx_count ?? 0,
    dailyGasUsed: row?.gas_used ?? 0,
  };
};

/** Tracks new users from Dune EVM transaction tables using nonce-zero senders. */
export const getDuneEvmNewUsers = async (options: FetchOptions, table = "CHAIN.transactions") => {
  const [row]: DuneEvmStatsRow[] = await queryDuneSql(options, `
    SELECT COUNT(DISTINCT CASE WHEN nonce = 0 THEN "from" END) AS new_users
    FROM ${table}
    WHERE success = true
      AND "from" IS NOT NULL
      AND block_date >= CAST(from_unixtime(${options.startTimestamp}) AS date)
      AND block_date <= CAST(from_unixtime(${options.endTimestamp}) AS date)
      AND block_time > from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `);

  return { dailyNewUsers: row?.new_users ?? 0 };
};

export function duneChainStats(chain: string, start: string, table = "CHAIN.transactions", mode: DuneChainStatsMode = "active-users"): SimpleAdapter {
  return {
    version: 2,
    dependencies: [Dependencies.DUNE],
    adapter: {
      [chain]: {
        fetch: (options: FetchOptions) => mode === "new-users"
          ? getDuneEvmNewUsers(options, table)
          : getDuneEvmActiveUsers(options, table),
        start,
      },
    },
  };
}
