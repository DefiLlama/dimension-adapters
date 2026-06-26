import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
    const alliumQuery = `
    WITH trades AS (
        SELECT maker AS trader, block_timestamp
        FROM polygon.predictions.trades
        WHERE protocol = 'polymarket'
          AND event_name = 'OrderFilled'
          AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
        UNION ALL
        SELECT taker AS trader, block_timestamp
        FROM polygon.predictions.trades
        WHERE protocol = 'polymarket'
          AND event_name = 'OrderFilled'
          AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
    )
    SELECT
        COUNT(DISTINCT trader)
        - COUNT(DISTINCT CASE
            WHEN block_timestamp < TO_TIMESTAMP_NTZ('${options.startTimestamp}') THEN trader
          END) AS new_users
    FROM trades
    `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyNewUsers: alliumResult[0].new_users,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.POLYGON],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    start: "2020-09-30",
};

export default adapter;
