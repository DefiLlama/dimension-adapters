WITH position_changes AS (
    -- IncreasePositionEvent
    SELECT
        date_trunc('day', block_time) AS day,
        to_base58(bytearray_substring(data, 1+121, 32)) AS position_mint,
        bytearray_to_bigint(bytearray_substring(data, 1+48, 1)) AS position_side,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+291, 8))) AS DOUBLE) AS size_usd_delta,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+315, 8))) AS DOUBLE) AS price,
        0 AS has_profit,
        0 AS pnl_delta,
        1 AS is_increase
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xf5715534d6bb9984
    AND tx_success = true

    UNION ALL

    -- InstantIncreasePositionEvent
    SELECT
        date_trunc('day', block_time) AS day,
        to_base58(bytearray_substring(data, 1+121, 32)) AS position_mint,
        bytearray_to_bigint(bytearray_substring(data, 1+48, 1)) AS position_side,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+217, 8))) AS DOUBLE) AS size_usd_delta,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+241, 8))) AS DOUBLE) AS price,
        0 AS has_profit,
        0 AS pnl_delta,
        1 AS is_increase
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xcdec3904d16a5745
    AND tx_success = true

    UNION ALL

    -- DecreasePositionEvent
    -- hasProfit at 219, pnlDelta at 220, price variable due to option<u64> transferToken
    SELECT
        date_trunc('day', block_time) AS day,
        to_base58(bytearray_substring(data, 1+121, 32)) AS position_mint,
        bytearray_to_bigint(bytearray_substring(data, 1+48, 1)) AS position_side,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+292, 8))) AS DOUBLE) AS size_usd_delta,
        CASE WHEN bytearray_to_bigint(bytearray_substring(data, 1+308, 1)) = 1
            THEN CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+317, 8))) AS DOUBLE)
            ELSE CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+309, 8))) AS DOUBLE)
        END AS price,
        bytearray_to_bigint(bytearray_substring(data, 1+219, 1)) AS has_profit,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+220, 8))) AS DOUBLE) AS pnl_delta,
        0 AS is_increase
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0x409c2b4a6d83107f
    AND tx_success = true

    UNION ALL

    -- InstantDecreasePositionEvent
    -- hasProfit at 185, pnlDelta at 186
    SELECT
        date_trunc('day', block_time) AS day,
        to_base58(bytearray_substring(data, 1+121, 32)) AS position_mint,
        bytearray_to_bigint(bytearray_substring(data, 1+48, 1)) AS position_side,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+258, 8))) AS DOUBLE) AS size_usd_delta,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+282, 8))) AS DOUBLE) AS price,
        bytearray_to_bigint(bytearray_substring(data, 1+185, 1)) AS has_profit,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+186, 8))) AS DOUBLE) AS pnl_delta,
        0 AS is_increase
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xabad6a19efbe3a3b
    AND tx_success = true

    UNION ALL

    -- LiquidateFullPositionEvent
    -- positionMint at 145, positionSizeUsd at 177, hasProfit at 185, pnlDelta at 186, price at 274
    SELECT
        date_trunc('day', block_time) AS day,
        to_base58(bytearray_substring(data, 1+145, 32)) AS position_mint,
        bytearray_to_bigint(bytearray_substring(data, 1+48, 1)) AS position_side,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+177, 8))) AS DOUBLE) AS size_usd_delta,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+274, 8))) AS DOUBLE) AS price,
        bytearray_to_bigint(bytearray_substring(data, 1+185, 1)) AS has_profit,
        CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+186, 8))) AS DOUBLE) AS pnl_delta,
        0 AS is_increase
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) IN (0x68452084d423bf2f, 0x806547a880485654)
    AND tx_success = true
),
native_deltas AS (
    SELECT
        day,
        position_mint,
        position_side,
        CASE
            WHEN is_increase = 1 THEN
                size_usd_delta / price
            WHEN position_side = 1 THEN
                -1 * (CASE WHEN has_profit = 1
                    THEN size_usd_delta + pnl_delta
                    ELSE size_usd_delta - pnl_delta
                END) / price
            ELSE
                -1 * (CASE WHEN has_profit = 1
                    THEN size_usd_delta - pnl_delta
                    ELSE size_usd_delta + pnl_delta
                END) / price
        END AS native_token_delta
    FROM position_changes
    WHERE price > 0
),
daily_per_mint AS (
    SELECT
        day,
        position_mint,
        position_side,
        SUM(native_token_delta) AS daily_native_delta
    FROM native_deltas
    GROUP BY day, position_mint, position_side
),
cumulative_oi AS (
    SELECT
        day,
        position_mint,
        position_side,
        SUM(daily_native_delta) OVER (
            PARTITION BY position_mint, position_side
            ORDER BY day
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_native_oi
    FROM daily_per_mint
)
SELECT
    day,
    position_mint,
    position_side,
    cumulative_native_oi
FROM cumulative_oi
ORDER BY day, position_mint;
