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
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
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
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Swap fees
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_poolswapevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Swap exact out fees
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        CAST(swapUsdAmount AS DOUBLE) / 1e6 * CAST(feeBps AS DOUBLE) / 10000 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_poolswapexactoutevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Open position - all fees combined
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        COALESCE(CAST(positionFeeUsd AS DOUBLE), CAST(feeUsd AS DOUBLE)) / 1e6 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_increasepositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Instant open position - all fees combined
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        COALESCE(CAST(positionFeeUsd AS DOUBLE), CAST(feeUsd AS DOUBLE)) / 1e6 AS open_fees,
        0 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_instantincreasepositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Close position - all fees combined
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        COALESCE(CAST(positionFeeUsd AS DOUBLE), CAST(feeUsd AS DOUBLE)) / 1e6 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_decreasepositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Instant close position - all fees combined
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        COALESCE(CAST(positionFeeUsd AS DOUBLE), CAST(feeUsd AS DOUBLE)) / 1e6 AS close_fees,
        0 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_instantdecreasepositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Liquidation fees (old event - uses feeUsd only)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        CAST(feeUsd AS DOUBLE) / 1e6 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_liquidatepositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Liquidate full position - all fees combined (new event with breakdown)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        COALESCE(CAST(liquidationFeeUsd AS DOUBLE), CAST(feeUsd AS DOUBLE)) / 1e6 AS liquidation_fees,
        COALESCE(CAST(fundingFeeUsd AS DOUBLE), 0) / 1e6 AS funding_fees,
        COALESCE(CAST(priceImpactFeeUsd AS DOUBLE), 0) / 1e6 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_liquidatefullpositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
    
    UNION ALL
    
    -- Liquidate borrow position (uses liquidationFeeUsd)
    SELECT
        date_trunc('day', evt_block_time) AS day,
        0 AS add_liq_fees,
        0 AS remove_liq_fees,
        0 AS swap_fees,
        0 AS open_fees,
        0 AS close_fees,
        CAST(liquidationFeeUsd AS DOUBLE) / 1e6 AS liquidation_fees,
        0 AS funding_fees,
        0 AS price_impact_fees
    FROM jupiter_solana.perpetuals_evt_liquidateborrowpositionevent
    WHERE evt_block_time >= FROM_UNIXTIME({{start}})
        AND evt_block_time < FROM_UNIXTIME({{end}})
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
