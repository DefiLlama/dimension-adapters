/**
 * Adapter for Ape.pro DEX on Solana
 * Volume data methodology:
 * 1. First identifies all transactions from Ape.pro by filtering solana.instruction_calls 
 *    where executing_account matches Ape.pro's program ID and instruction data matches swap signature(preFlashSwapApprove)
 * 2. Uses these transaction IDs to fetch corresponding trades from dex_solana.trades table
 *    which provides accurate USD amounts for each trade
 * 3. This approach is used instead of parsing instruction logs directly since they only contain
 *    inputAmount without quote amounts, which would require additional token price lookups
 */

import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    daily_volume: number
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData = await queryDuneSql(options, `
        WITH ape_pro_txs AS (
            SELECT
                block_time,
                tx_id
            FROM
                solana.instruction_calls
            WHERE
                executing_account = 'JSW99DKmxNyREQM14SQLDykeBvEUG63TeohrvmofEiw'
                AND varbinary_starts_with (data, 0xe445a52e51cb9a1d516ce3becdd00ac4)
                AND tx_success = true
                AND TIME_RANGE
        ),
        dex_trades AS (
            SELECT *
            FROM dex_solana.trades
            WHERE tx_id IN (SELECT tx_id FROM ape_pro_txs)
            AND TIME_RANGE
        ),
        ape_pro_detailed_txs AS (
            SELECT 
                l.block_time
                , l.tx_id
                , t.amount_usd AS amount_usd
            FROM ape_pro_txs as l
            LEFT JOIN dex_trades t
                ON t.tx_id = l.tx_id
        )
        SELECT 
            SUM(f.amount_usd) as daily_volume
        FROM ape_pro_detailed_txs as f
    `)
    const dailyVolume = data.daily_volume || 0

    return { 
        dailyVolume
    }
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2024-09-13',
    isExpensiveAdapter: true
}

export default adapter
