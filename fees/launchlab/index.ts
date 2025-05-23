import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    daily_volume_sol: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH
        launchlab_trades AS (
            SELECT
                call_block_time,
                call_tx_id,
                amount_in as amount
            FROM
                raydium_solana.raydium_launchpad_call_buy_exact_in
            WHERE
                account_program = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
                AND call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
            UNION ALL
            SELECT
                call_block_time,
                call_tx_id,
                maximum_amount_in as amount
            FROM
                raydium_solana.raydium_launchpad_call_buy_exact_out
            WHERE
                account_program = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
                AND call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
            UNION ALL
            SELECT
                call_block_time,
                call_tx_id,
                minimum_amount_out as amount
            FROM
                raydium_solana.raydium_launchpad_call_sell_exact_in
            WHERE
                account_program = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
                AND call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
            UNION ALL
            SELECT
                call_block_time,
                call_tx_id,
                amount_out as amount
            FROM
                raydium_solana.raydium_launchpad_call_sell_exact_out
            WHERE
                account_program = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
                AND call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT
            SUM(amount / 1e9) AS daily_volume_sol
        FROM
            launchlab_trades
    `)
    const dailyFees = options.createBalances()
    dailyFees.addCGToken('solana', Number(data[0].daily_volume_sol) * 0.01)
    const dailyHoldersRevenue = dailyFees.clone(0.25) // 25% of is burned
    const dailyProtocolRevenue = dailyFees.clone(0.75) // 75% of fees go to the protocol

    return { 
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    }
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-15',
            meta: {
                methodology: {
                    fees: '1% fee on all transactions.',
                    revenue: '0.25% burned + 0.75% to protocol of 1% tx fees',
                    holdersRevenue: '0.25% of fees are burned.',
                    protocolRevenue: '0.75% of fees go to the protocol.'
                }
            }
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
