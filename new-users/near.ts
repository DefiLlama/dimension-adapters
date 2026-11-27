import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH touched AS (
      SELECT DISTINCT account_id
      FROM near.raw.account_changes
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )
    SELECT COUNT(*) AS new_users
    FROM touched t
    WHERE NOT EXISTS (
      SELECT 1 FROM near.raw.account_changes h
      WHERE h.account_id = t.account_id
        AND h.block_timestamp < TO_TIMESTAMP_NTZ(${options.startTimestamp})
    )
  `;
  const [row] = await queryAllium(query);

  return {
    dailyNewUsers: row.new_users,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  start: "2020-07-21",
  methodology: {
    NewUsers: "Accounts (named and implicit) whose first on-chain state change falls in the day.",
  },
};

export default adapter;
