-- Jupiter Perpetual Fees - Hybrid approach
-- Uses instruction_calls for open_fees, close_fees, liquidation_fees
-- Uses decoded tables for funding_fees and price_impact_fees
-- feeUsd on position events (read from instruction_calls below) already includes the borrow (funding) fee and the
-- price impact fee, so the decoded legs below subtract them from open/close fees to report each fee once.
-- Liquidations: the instruction_calls leg reads liquidationFeeUsd only, so the decoded leg adds the base close fee
-- (positionFeeUsd minus the price impact fee it contains).

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
        -(COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) + COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0)) / 1e6 AS open_fees,
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
        -(COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) + COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0)) / 1e6 AS open_fees,
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
        -(COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) + COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0)) / 1e6 AS close_fees,
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
        -(COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) + COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0)) / 1e6 AS close_fees,
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
        (COALESCE(CAST(positionFeeUsd AS DOUBLE), 0) - COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0)) / 1e6 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_liquidatefullpositionevent
    WHERE evt_block_time >= from_unixtime({{start}})
        AND evt_block_time < from_unixtime({{end}})
)

, staking AS (
    -- SOL staking rewards of the JLP pool's SOL custody, from the RedeemStake program log (lamports)
    SELECT
        date_trunc('day', call_block_time) AS day,
        SUM(COALESCE(TRY_CAST(regexp_extract(array_join(call_log_messages, ' '), 'Stake rewards: ([0-9]+)', 1) AS DOUBLE), 0)) / 1e9 AS staking_rewards_sol
    FROM jupiter_solana.perpetuals_call_redeemstake
    WHERE call_block_time >= from_unixtime({{start}})
        AND call_block_time < from_unixtime({{end}})
    GROUP BY 1
), loans AS (
    -- JLP Loans interest as it accrues. Every 15 minutes withdrawFees2 sweeps each custody's fees and logs an event
    -- (Program data, discriminator 0xec768a5a8badb159). On the USDC custody, bytes 160..167 of that event are the loan
    -- interest accrued since the previous sweep (USDC, 6 decimals), split 75% LP / 25% protocol like the fees.
    -- Every call row carries the whole transaction's logs, so each transaction is read once. Other programs in the same
    -- transaction can log Program data that is not one base64 chunk; TRY skips those, the discriminator keeps this event.
    SELECT
        date_trunc('day', block_time) AS day,
        COUNT(*) AS fee_withdrawals,
        COUNT_IF(to_base58(bytearray_substring(evt, 1+40, 32)) = 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa') AS usdc_fee_withdrawals, -- USDC custody
        SUM(CASE WHEN to_base58(bytearray_substring(evt, 1+40, 32)) = 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa' -- USDC custody
            THEN bytearray_to_bigint(bytearray_reverse(bytearray_substring(evt, 1+160, 8)))
            ELSE 0
        END) / 1e6 AS loan_interest
    FROM (
        SELECT call_block_time AS block_time, TRY(from_base64(split_part(substr(msg, 15), ' ', 1))) AS evt
        FROM (
            SELECT
                call_block_time,
                call_log_messages,
                ROW_NUMBER() OVER (PARTITION BY call_tx_id ORDER BY call_outer_instruction_index) AS rn
            FROM jupiter_solana.perpetuals_call_withdrawfees2
            WHERE call_block_time >= from_unixtime({{start}})
                AND call_block_time < from_unixtime({{end}})
        ) w
        CROSS JOIN UNNEST(call_log_messages) AS l(msg)
        WHERE rn = 1
            AND msg LIKE 'Program data: %'
    ) e
    WHERE bytearray_substring(evt, 1, 8) = 0xec768a5a8badb159
    GROUP BY 1
), fees AS (
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
)

SELECT
    f.*,
    COALESCE(s.staking_rewards_sol, 0) AS staking_rewards_sol,
    l.loan_interest,
    l.fee_withdrawals,
    l.usdc_fee_withdrawals
FROM fees f
LEFT JOIN staking s ON s.day = f.day
LEFT JOIN loans l ON l.day = f.day
ORDER BY f.day
