import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(COUNT(DISTINCT account), 0) AS user_count,
      COALESCE(COUNT(DISTINCT hash), 0) AS transaction_count
    FROM xrp_ledger.raw.transactions
    WHERE ledger_close_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND ledger_close_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND transaction_result = 'tesSUCCESS'
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
  chains: [CHAIN.RIPPLE],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2013-01-01",
};

export default adapter;
