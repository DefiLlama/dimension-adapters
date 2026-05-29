import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    WITH first_seen AS (
      SELECT
        SOURCE_ACCOUNT,
        MIN(LEDGER_CLOSE_TIME) AS first_seen_timestamp
      FROM stellar.raw.transactions
      WHERE LEDGER_CLOSE_TIME < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND SOURCE_ACCOUNT IS NOT NULL
        AND SUCCESSFUL = TRUE
      GROUP BY 1
    )
    SELECT COALESCE(COUNT(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND first_seen_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyNewUsers: alliumResult[0].new_users,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2015-09-30",
};

export default adapter;
