import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type Row = {
  dau: number;
  tx_count: number;
}

const fetch = async (options: FetchOptions) => {
  const [row]: Row[] = await queryDuneSql(options, `
    SELECT
      COUNT(*) AS tx_count,
      COUNT(DISTINCT sender) AS dau
    FROM sui.transactions
    WHERE execution_success = true
      AND sender IS NOT NULL
      AND is_system_txn = false
      AND timestamp_ms > ${options.startTimestamp * 1000}
      AND timestamp_ms <= ${options.endTimestamp * 1000}
  `);

  return {
    dailyActiveUsers: row?.dau ?? 0,
    dailyTransactionsCount: row?.tx_count ?? 0,
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
