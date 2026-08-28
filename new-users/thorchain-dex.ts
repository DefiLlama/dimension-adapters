import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const result = await queryDuneSql(options, `
    WITH user_actions AS (
      SELECT from_address, block_timestamp
      FROM thorchain.defi_swaps
      WHERE block_timestamp < from_unixtime(${options.endTimestamp})
        AND from_address IS NOT NULL

      UNION ALL

      SELECT from_address, block_timestamp
      FROM thorchain.defi_liquidity_actions
      WHERE block_timestamp < from_unixtime(${options.endTimestamp})
        AND from_address IS NOT NULL
    ),
    first_actions AS (
      SELECT
        from_address,
        MIN(block_timestamp) AS first_seen
      FROM user_actions
      GROUP BY 1
    )
    SELECT COALESCE(COUNT(*), 0) AS new_users
    FROM first_actions
    WHERE first_seen >= from_unixtime(${options.startTimestamp})
      AND first_seen < from_unixtime(${options.endTimestamp})
  `);

  return {
    dailyNewUsers: result[0].new_users,
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
