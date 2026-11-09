import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { queryDuneSql } from "./dune";

/**
 * Throws unless Dune has had time to finish indexing the window's Solana data.
 *
 * Dune finishes a Solana day several hours after it ends, and a window reaching into that period
 * answers with a partial sum rather than an error, so an adapter that does not wait publishes a
 * truncated day. Call this before querying any `solana.*`, `tokens_solana.*` or `dex_solana.*`
 * table. Only safe on single-chain adapters: `runAdapter` drops every chain's record when one
 * chain throws.
 */
export function assertDuneSolanaIndexed(options: FetchOptions): void {
    const now = Date.now()
    const tenHoursAgo = now - (10 * 60 * 60 * 1000)
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
        console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
        throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
    }
}

export function duneSolanaDexTrades(project: string, start: string, { excludeRoundTrips = false }: { excludeRoundTrips?: boolean } = {}) {
    const fetch = async (options: FetchOptions) => {
        assertDuneSolanaIndexed(options)

        // excludeRoundTrips drops both legs when one tx buys and sells on the same pool.
        // project_program_id holds the pool account in spellbook solana_amm_base_trades models (e.g. zerofi)
        const query = excludeRoundTrips ? `
            SELECT
                COALESCE(SUM(volume), 0) AS daily_volume
            FROM (
                SELECT
                    SUM(amount_usd) AS volume,
                    COUNT(DISTINCT token_sold_mint_address) AS directions
                FROM
                    dex_solana.trades
                WHERE
                    TIME_RANGE
                    AND project = '${project}'
                GROUP BY
                    tx_id,
                    project_program_id
            )
            WHERE directions = 1
        ` : `
            SELECT
                COALESCE(SUM(amount_usd), 0) AS daily_volume
            FROM
                dex_solana.trades
            WHERE
                TIME_RANGE
                AND project = '${project}'
        `;
        const data = await queryDuneSql(options, query)

        return {
            dailyVolume: data[0].daily_volume,
        }
    }

    return {
        fetch,
        chains: [CHAIN.SOLANA],
        start,
        dependencies: [Dependencies.DUNE],
        isExpensiveAdapter: true,
    }
}