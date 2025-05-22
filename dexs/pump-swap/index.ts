import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
    quoteAmountOutorIn: number;
    lpFee: number;
    protocolFee: number;
    quoteMint: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `WITH
        decoded_pool AS (
            SELECT
                to_base58 (bytearray_substring (data, 182, 32)) AS pool,
                to_base58 (bytearray_substring (data, 91, 32)) AS quoteMint
            FROM
                solana.instruction_calls
            WHERE
                varbinary_starts_with (data, 0xe445a52e51cb9a1db1310cd2a076a774)
                AND executing_account = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
        ),
        decoded_swap AS (
            SELECT
                tx_id,
                block_time,
                BYTEARRAY_TO_UINT256 (
                    BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 73, 8))
                ) AS quoteAmountOutorIn,
                to_base58 (bytearray_substring (data, 129, 32)) AS pool
            FROM
                solana.instruction_calls
            WHERE
                tx_success = TRUE
                AND inner_executing_account = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
                AND (
                    VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d3e2f370aa503dc2a)
                    OR VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d67f4521f2cf57777)
                )
                AND TIME_RANGE
        ),
        pumpswap_trades AS (
            SELECT
                s.block_time,
                DATE_TRUNC('day', s.block_time) AS dt,
                s.quoteAmountOutorIn,
                p.quoteMint
            FROM
                decoded_swap s
                JOIN decoded_pool p ON s.pool = p.pool
            WHERE
                s.block_time >= TIMESTAMP '2025-03-15'
                AND p.quoteMint IN (
                    'So11111111111111111111111111111111111111112',
                    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
                    'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT'
                )
                AND TIME_RANGE
        ),
        daily_volume AS (
            SELECT
                dt AS date,
                quoteMint,
                SUM(quoteAmountOutorIn) AS quoteAmountOutorIn
            FROM
                pumpswap_trades
            WHERE
                quoteAmountOutorIn IS NOT NULL
            GROUP BY
                dt,
                quoteMint
        )
    SELECT
        date,
        quoteAmountOutorIn,
        quoteMint
    FROM
        daily_volume
    ORDER BY
        date DESC
    `)
    const dailyVolume = options.createBalances()

    for (const item of data) {
        dailyVolume.add(item.quoteMint, item.quoteAmountOutorIn)
    }

    return { 
        dailyVolume
    }
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-03-15'
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
