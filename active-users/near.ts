import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const alliumQuery = `
    SELECT
      COALESCE(COUNT(DISTINCT signer_id), 0) AS user_count,
      COALESCE(COUNT(hash), 0) AS transaction_count
    FROM near.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND success = TRUE
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
  chains: [CHAIN.NEAR],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2020-10-13",
};

export default adapter;
