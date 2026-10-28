import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// CTF / NegRisk contracts (tx + gas are measured against direct interactions with these)
const contractAddresses = [
    '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045', // Ctf
    '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296', // NegRiskCtf
    '0xE111180000d2663C0091e4f400237545B87B996B', // CtfV2
    '0xe2222d279d744050d28e00520010520000310F59', // NegRiskCtfV2
]

const fetch = async (options: FetchOptions) => {
    const contractAddressList = contractAddresses.map(a => a.toLowerCase()).join(', ')
    const window = `evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})`
    const query = `
    WITH fills AS (
        SELECT maker, taker FROM polymarket_v2_polygon.ctfexchange_evt_orderfilled WHERE ${window}
        UNION ALL
        SELECT maker, taker FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled WHERE ${window}
        UNION ALL
        SELECT maker, taker FROM polymarket_polygon.CTFExchange_evt_OrderFilled WHERE ${window}
    ),
    trades_data AS (
        SELECT COUNT(DISTINCT trader) AS active_users
        FROM fills CROSS JOIN UNNEST(ARRAY[maker, taker]) AS t(trader)
    ),
    blockchain_data AS (
        SELECT
            SUM(CAST(gas_used AS double) * CAST(gas_price AS double)) / 1e18 AS total_gas,
            COUNT(*) AS total_transactions
        FROM polygon.transactions
        WHERE "to" IN (${contractAddressList})
          AND block_time >= from_unixtime(${options.startTimestamp})
          AND block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
        trades_data.active_users,
        blockchain_data.total_gas,
        blockchain_data.total_transactions
    FROM trades_data
    CROSS JOIN blockchain_data
    `;

    const result = await queryDuneSql(options, query);

    return {
        dailyActiveUsers: result[0].active_users,
        dailyTransactionsCount: result[0].total_transactions,
        dailyGasUsed: result[0].total_gas,
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
