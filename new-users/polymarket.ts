import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
    const before = `evt_block_time < from_unixtime(${options.endTimestamp})`
    const query = `
    WITH fills AS (
        SELECT maker, taker, evt_block_time FROM polymarket_v2_polygon.ctfexchange_evt_orderfilled WHERE ${before}
        UNION ALL
        SELECT maker, taker, evt_block_time FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled WHERE ${before}
        UNION ALL
        SELECT maker, taker, evt_block_time FROM polymarket_polygon.CTFExchange_evt_OrderFilled WHERE ${before}
    ),
    first_seen AS (
        SELECT trader, MIN(evt_block_time) AS first_ts
        FROM fills CROSS JOIN UNNEST(ARRAY[maker, taker]) AS t(trader)
        GROUP BY trader
    )
    SELECT COUNT(*) AS new_users
    FROM first_seen
    WHERE first_ts >= from_unixtime(${options.startTimestamp})
    `;

    const result = await queryDuneSql(options, query);

    return {
        dailyNewUsers: result[0].new_users,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.POLYGON],
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    start: "2020-09-30",
};

export default adapter;
