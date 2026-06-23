import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(COUNT(DISTINCT "from"), 0) AS user_count,
      COALESCE(COUNT(*), 0) AS transaction_count
    FROM hyperevm.transactions
    WHERE TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);

  return {
    dailyActiveUsers: result[0].user_count,
    dailyTransactionsCount: result[0].transaction_count,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2025-02-18",
};

export default adapter;
