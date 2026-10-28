import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(COUNT(DISTINCT "from"), 0) AS new_users
    FROM mezo.transactions
    WHERE TIME_RANGE
      AND nonce = 0
  `;

  const result = await queryDuneSql(options, query);

  return {
    dailyNewUsers: result[0].new_users,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MEZO],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2025-05-06",
};

export default adapter;
