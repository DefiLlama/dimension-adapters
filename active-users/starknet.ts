import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(COUNT(DISTINCT sender_address), 0) AS user_count,
      COALESCE(COUNT(*), 0) AS transaction_count
    FROM starknet.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
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
  chains: [CHAIN.STARKNET],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2022-06-15",
};

export default adapter;
