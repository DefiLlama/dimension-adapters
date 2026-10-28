import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const result = await queryDuneSql(options, `
    WITH user_actions AS (
      SELECT from_address, tx_id
      FROM thorchain.defi_swaps
      WHERE block_timestamp >= from_unixtime(${options.startTimestamp})
        AND block_timestamp < from_unixtime(${options.endTimestamp})
        AND from_address IS NOT NULL

      UNION ALL

      SELECT from_address, tx_id
      FROM thorchain.defi_liquidity_actions
      WHERE block_timestamp >= from_unixtime(${options.startTimestamp})
        AND block_timestamp < from_unixtime(${options.endTimestamp})
        AND day >= date_trunc('day', from_unixtime(${options.startTimestamp}))
        AND day < date_trunc('day', from_unixtime(${options.endTimestamp}))
        AND from_address IS NOT NULL
    )
    SELECT
      COALESCE(COUNT(DISTINCT from_address), 0) AS user_count,
      COALESCE(COUNT(DISTINCT tx_id), 0) AS transaction_count
    FROM user_actions
  `);

  return {
    dailyActiveUsers: result[0].user_count,
    dailyTransactionsCount: result[0].transaction_count,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2021-04-11",
};

export default adapter;
