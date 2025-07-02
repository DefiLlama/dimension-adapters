import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    daily_volume_sol: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH launchlab_trades AS (
            SELECT
                block_time,
                BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 105, 8))) as amount_in,
                BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 113, 8))) as amount_out,
                BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 121, 8))) as protocol_fee,
                BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 129, 8))) as platform_fee,
                BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 137, 8))) as share_fee,
                BYTEARRAY_TO_UINT256(SUBSTR(data, 145, 1)) as trade_direction,
                CASE
                    WHEN BYTEARRAY_TO_UINT256(SUBSTR(data, 145, 1)) = 0 THEN BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 105, 8)))
                    ELSE BYTEARRAY_TO_UINT256(REVERSE(SUBSTR(data, 113, 8)))
                END as sol_amount
            FROM
                solana.instruction_calls
            WHERE
                executing_account = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time <= from_unixtime(${options.endTimestamp})
                AND VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1dbddb7fd34ee661ee)
        )
        SELECT
            SUM(sol_amount / 1e9) AS daily_volume_sol
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
