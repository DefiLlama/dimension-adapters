import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const contractAddresses = [
    '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045', // Ctf
    '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296', // NegRiskCtf
    '0xE111180000d2663C0091e4f400237545B87B996B', // CtfV2
    '0xe2222d279d744050d28e00520010520000310F59', // NegRiskCtfV2
]

const fetch = async (options: FetchOptions) => {
    const contractAddressList = contractAddresses.map(a => `'${a.toLowerCase()}'`).join(', ')
    const alliumQuery = `
    WITH trades_data AS (
        SELECT 
            COALESCE(COUNT(DISTINCT trader), 0) AS active_users
        FROM (
            SELECT maker AS trader
            FROM polygon.predictions.trades
            WHERE protocol = 'polymarket'
              AND event_name = 'OrderFilled'
              AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
              AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
            UNION ALL
            SELECT taker AS trader
            FROM polygon.predictions.trades
            WHERE protocol = 'polymarket'
              AND event_name = 'OrderFilled'
              AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
              AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
        )
    ),
    blockchain_data AS (
        SELECT
            COALESCE(SUM(receipt_effective_gas_price * receipt_gas_used) / 1e18, 0) AS total_gas,
            COUNT(*) AS total_transactions
        FROM polygon.raw.transactions
        WHERE to_address IN (${contractAddressList})
          AND block_timestamp > TO_TIMESTAMP_NTZ('${options.startTimestamp}')
          AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
    )
    SELECT
        trades_data.active_users,
        blockchain_data.total_gas,
        blockchain_data.total_transactions
    FROM trades_data
    CROSS JOIN blockchain_data
    `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyActiveUsers: alliumResult[0].active_users,
        dailyTransactionsCount: alliumResult[0].total_transactions,
        dailyGasUsed: alliumResult[0].total_gas,
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
