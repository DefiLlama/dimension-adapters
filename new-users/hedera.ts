import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const alliumQuery = `
    SELECT COALESCE(COUNT(*), 0) AS new_users
    FROM hedera.raw.accounts
    WHERE TO_TIMESTAMP_NTZ(SPLIT_PART(created_timestamp, '.', 1)) >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND TO_TIMESTAMP_NTZ(SPLIT_PART(created_timestamp, '.', 1)) < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const alliumResult = await queryAllium(alliumQuery);

  return {
    dailyNewUsers: alliumResult[0].new_users,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HEDERA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2019-09-13",
};

export default adapter;
