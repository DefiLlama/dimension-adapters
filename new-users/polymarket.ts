import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
    const query = `
    WITH trades AS (
        SELECT maker AS trader, evt_block_time FROM polymarket_v2_polygon.ctfexchange_evt_orderfilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT taker AS trader, evt_block_time FROM polymarket_v2_polygon.ctfexchange_evt_orderfilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT maker AS trader, evt_block_time FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT taker AS trader, evt_block_time FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT maker AS trader, evt_block_time FROM polymarket_polygon.CTFExchange_evt_OrderFilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT taker AS trader, evt_block_time FROM polymarket_polygon.CTFExchange_evt_OrderFilled
          WHERE evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
        COUNT(DISTINCT trader)
        - COUNT(DISTINCT CASE
            WHEN evt_block_time < from_unixtime(${options.startTimestamp}) THEN trader
          END) AS new_users
    FROM trades
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
