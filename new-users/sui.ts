import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const alliumQuery = `
    WITH first_seen AS (
        SELECT
            sender,
            MIN(timestamp_ms) AS first_seen_timestamp
        FROM sui.raw.transaction_blocks
        WHERE timestamp_ms < ${options.endTimestamp * 1000}
          AND sender IS NOT NULL
        GROUP BY 1
    )
    SELECT COALESCE(count(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= ${options.startTimestamp * 1000}
      AND first_seen_timestamp < ${options.endTimestamp * 1000}
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
