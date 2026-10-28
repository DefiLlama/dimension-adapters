import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
    const alliumQuery = `
    WITH first_seen AS (
        SELECT
            sender,
            MIN(block_timestamp) AS first_seen_timestamp
        FROM aptos.raw.transactions
        WHERE block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND sender IS NOT NULL
        GROUP BY 1
    )
    SELECT COALESCE(count(*), 0) AS new_users
    FROM first_seen
    WHERE first_seen_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND first_seen_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyNewUsers: alliumResult[0].new_users,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.APTOS],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start: "2022-10-20",
};

export default adapter;
