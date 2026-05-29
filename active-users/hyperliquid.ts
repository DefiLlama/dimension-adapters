import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(active_users, 0) AS user_count,
      COALESCE(success_transactions, 0) AS transaction_count
    FROM hyperliquid.metrics.overview
    WHERE activity_date = TO_DATE(TO_TIMESTAMP_NTZ(${options.startTimestamp}))
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyActiveUsers: alliumResult[0]?.user_count,
    dailyTransactionsCount: alliumResult[0]?.transaction_count,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  dependencies: [Dependencies.ALLIUM],
  start: "2023-11-24",
};

export default adapter;
