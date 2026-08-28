import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {

  const from = new Date(options.fromTimestamp * 1000).toISOString();
  const to = new Date(options.toTimestamp * 1000).toISOString();

    const alliumQuery = `
    WITH first_seen AS (
        SELECT
            sender,
            MIN(checkpoint_timestamp) AS first_seen_timestamp
        FROM sui.raw.transaction_blocks
        WHERE checkpoint_timestamp < '${to}'
          AND sender IS NOT NULL
        GROUP BY 1
    )
    SELECT COALESCE(count(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= '${from}'
      AND first_seen_timestamp < '${to}'
  `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyNewUsers: alliumResult[0].new_users,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SUI],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start: "2023-04-12",
};

export default adapter;
