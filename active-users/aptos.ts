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
    FROM aptos.user_transactions
    WHERE success = true
      AND sender IS NOT NULL
      AND block_date >= CAST(from_unixtime(${options.startTimestamp}) AS date)
      AND block_date <= CAST(from_unixtime(${options.endTimestamp}) AS date)
      AND block_time > from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
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
    [CHAIN.APTOS]: {
      fetch,
      start: "2022-10-20",
    },
  },
};

export default adapter;
