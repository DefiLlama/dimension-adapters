import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type Row = {
  dau: number;
  new_users: number;
  tx_count: number;
}

const fetch = async (options: FetchOptions) => {
  const [row]: Row[] = await queryDuneSql(options, `
    WITH txs AS (
      SELECT
        sender
      FROM sui.transactions
      WHERE execution_success = true
        AND sender IS NOT NULL
        AND is_system_txn = false
        AND timestamp_ms > ${options.startTimestamp * 1000}
        AND timestamp_ms <= ${options.endTimestamp * 1000}
    ),
    recent_senders AS (
      SELECT DISTINCT sender FROM txs
    ),
    first_seen AS (
      SELECT
        t.sender,
        MIN(t.timestamp_ms) AS first_seen_ms
      FROM sui.transactions t
      INNER JOIN recent_senders r ON t.sender = r.sender
      WHERE t.execution_success = true
        AND t.sender IS NOT NULL
        AND t.is_system_txn = false
      GROUP BY t.sender
    )
    SELECT
      COUNT(*) AS tx_count,
      COUNT(DISTINCT txs.sender) AS dau,
      COUNT(DISTINCT CASE
        WHEN first_seen_ms > ${options.startTimestamp * 1000} AND first_seen_ms <= ${options.endTimestamp * 1000}
        THEN first_seen.sender
      END) AS new_users
    FROM txs
    LEFT JOIN first_seen ON txs.sender = first_seen.sender
  `);

  return {
    dailyActiveUsers: row?.dau ?? 0,
    dailyTransactionsCount: row?.tx_count ?? 0,
    dailyNewUsers: row?.new_users ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2023-05-05",
    },
  },
};

export default adapter;
