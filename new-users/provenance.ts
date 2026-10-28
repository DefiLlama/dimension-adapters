import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

// using allium as source as explorer used in active users gives incorrect new users count
const fetch = async (options: FetchOptions) => {
  const from = new Date(options.fromTimestamp * 1000).toISOString();
  const to = new Date(options.toTimestamp * 1000).toISOString();

  const alliumQuery = `
    WITH first_seen AS (
        SELECT
            SPLIT_PART(tx_acc_seq, '/', 1) AS user,
            MIN(block_timestamp) AS first_seen_timestamp
        FROM provenance.raw.transactions
        WHERE block_timestamp < '${to}'
          AND code = 0
          AND tx_acc_seq IS NOT NULL
        GROUP BY 1
    )
    SELECT COALESCE(count(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= '${from}'
      AND first_seen_timestamp < '${to}'
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyNewUsers: alliumResult[0].new_users,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2025-07-11",
};

export default adapter;
