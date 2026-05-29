import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    WITH first_seen AS (
      SELECT
        account,
        MIN(utime) AS first_seen_timestamp
      FROM ton.raw.transactions
      WHERE utime < ${options.endTimestamp}
        AND account IS NOT NULL
        AND aborted = FALSE
      GROUP BY 1
    )
    SELECT COALESCE(COUNT(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= ${options.startTimestamp}
      AND first_seen_timestamp < ${options.endTimestamp}
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyNewUsers: alliumResult[0].new_users,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2021-08-03",
};

export default adapter;
