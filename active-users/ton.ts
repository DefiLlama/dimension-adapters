import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(COUNT(DISTINCT account), 0) AS user_count,
      COALESCE(COUNT(hash), 0) AS transaction_count
    FROM ton.raw.transactions
    WHERE utime >= ${options.startTimestamp}
      AND utime < ${options.endTimestamp}
      AND aborted = FALSE
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyActiveUsers: alliumResult[0].user_count,
    dailyTransactionsCount: alliumResult[0].transaction_count,
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
