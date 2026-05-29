import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    WITH first_seen AS (
      SELECT
        account,
        MIN(ledger_close_time) AS first_seen_timestamp
      FROM xrp_ledger.raw.transactions
      WHERE ledger_close_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND account IS NOT NULL
        AND transaction_result = 'tesSUCCESS'
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
  chains: [CHAIN.RIPPLE],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2013-01-01",
};

export default adapter;
