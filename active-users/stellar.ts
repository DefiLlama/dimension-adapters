import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(COUNT(DISTINCT SOURCE_ACCOUNT), 0) AS user_count,
      COALESCE(COUNT(HASH), 0) AS transaction_count
    FROM stellar.raw.transactions
    WHERE LEDGER_CLOSE_TIME >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND LEDGER_CLOSE_TIME < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND SUCCESSFUL = TRUE
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
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2015-09-30",
};

export default adapter;
