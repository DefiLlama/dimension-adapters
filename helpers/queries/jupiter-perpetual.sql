-- Jupiter Perpetual Fees - Hybrid approach
-- Uses instruction_calls for open_fees, close_fees, liquidation_fees
-- Uses decoded tables for funding_fees and price_impact_fees

WITH all_events AS (
    -- Add liquidity fees
    SELECT
        date_trunc('day', evt_block_time) AS day,
        CAST(tokenAmountUsd AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_addliquidityevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})
    
    UNION ALL
    
    -- Remove liquidity fees
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        CAST(removeAmountUsd AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_removeliquidityevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})
    
    UNION ALL
    
    -- Swap fees (cap at 100k to filter bad historical price data)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        CASE WHEN CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 > 100000 
            THEN 0 
            ELSE CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 
        END AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_poolswapevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})
    
    UNION ALL
    
    -- Swap exact out fees (cap at 100k to filter bad historical price data)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        CASE WHEN CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 > 100000 
            THEN 0 
            ELSE CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 
        END AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_poolswapexactoutevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- IncreasePositionEvent (open_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        CASE WHEN bytearray_to_bigint(bytearray_substring(data, 1+323, 1)) = 1
            THEN bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+340, 8))) / 1e6
            ELSE bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+332, 8))) / 1e6
        END AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xf5715534d6bb9984 -- IncreasePositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- InstantIncreasePositionEvent (open_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+265, 8))) / 1e6 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xcdec3904d16a5745 -- InstantIncreasePositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- DecreasePositionEvent (close_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        CASE 
            WHEN bytearray_to_bigint(bytearray_substring(data, 1+308, 1)) = 1 THEN
                CASE WHEN bytearray_to_bigint(bytearray_substring(data, 1+325, 1)) = 1
                    THEN bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+334, 8))) / 1e6
                    ELSE bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+326, 8))) / 1e6
                END
            ELSE
                CASE WHEN bytearray_to_bigint(bytearray_substring(data, 1+317, 1)) = 1
                    THEN bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+326, 8))) / 1e6
                    ELSE bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+318, 8))) / 1e6
                END
        END AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0x409c2b4a6d83107f -- DecreasePositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- InstantDecreasePositionEvent (close_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+298, 8))) / 1e6 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0xabad6a19efbe3a3b -- InstantDecreasePositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- LiquidateFullPositionEvent (liquidation_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+290, 8))) / 1e6 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0x806547a880485654 -- LiquidateFullPositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    UNION ALL

    -- =====================================================
    -- LiquidateBorrowPositionEvent (liquidation_fees from instruction_calls)
    -- =====================================================
    SELECT
        DATE_TRUNC('day', block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 1+192, 8))) / 1e6 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM solana.instruction_calls
    WHERE executing_account = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
    AND bytearray_substring(data, 1+8, 8) = 0x0b80fc3b31c038aa -- LiquidateBorrowPositionEvent
    AND tx_success = true
    AND block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})

    -- =====================================================
    -- funding_fees and price_impact_fees from decoded tables
    -- =====================================================

    UNION ALL

    -- IncreasePositionEvent (funding_fees, price_impact_fees from decoded table)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_increasepositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})

    UNION ALL

    -- InstantIncreasePositionEvent (funding_fees, price_impact_fees from decoded table)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_instantincreasepositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})

    UNION ALL

    -- DecreasePositionEvent (funding_fees, price_impact_fees from decoded table)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_decreasepositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})

    UNION ALL

    -- InstantDecreasePositionEvent (funding_fees, price_impact_fees from decoded table)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_instantdecreasepositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})

    UNION ALL

    -- LiquidateFullPositionEvent (funding_fees, price_impact_fees from decoded table)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_liquidatefullpositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})
)

SELECT
    day,
    SUM(add_liq_fees) AS add_liquidity_fees,
    SUM(remove_liq_fees) AS remove_liquidity_fees,
    SUM(swap_fees) AS swap_fees,
    SUM(open_fees) AS open_fees,
    SUM(close_fees) AS close_fees,
    SUM(liquidation_fees) AS liquidation_fees,
    SUM(funding_fees) AS funding_fees,
    SUM(price_impact_fees) AS price_impact_fees,
    SUM(add_liq_fees + remove_liq_fees + swap_fees + open_fees + close_fees + liquidation_fees + funding_fees + price_impact_fees) AS total_fees
FROM all_events
GROUP BY day
ORDER BY day
