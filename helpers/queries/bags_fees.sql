WITH
    /* =========================
       FeeShare V1 and direct
       ========================= */
    v2_fee_authorities AS (
        SELECT
            fee_authority,
            MIN(evt_block_time) AS created_at
        FROM bags_solana.bags_fee_share_evt_feeconfigsnapshotevent
        WHERE
            fee_authority IS NOT NULL
        GROUP BY 1
    ),
    dbc_pools AS (
        SELECT DISTINCT
            account_config,
            account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE call_tx_signer = '{{tx_signer}}'
    ),
    migrated_pools AS (
        SELECT
            m.account_config,
            m.account_pool,
            COALESCE(m.account_quote_mint, p.account_quote_mint) AS quote_mint,
            MIN(m.call_block_time) AS migrated_at
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
        JOIN dbc_pools p
            ON m.account_config = p.account_config
        WHERE m.call_block_slot > 337545541
        GROUP BY 1, 2, 3
    ),
    config_fees AS (
        SELECT
            config,
            fee_claimer,
            CAST(
                JSON_EXTRACT_SCALAR(
                    config_parameters,
                    '$.creator_trading_fee_percentage'
                ) AS INTEGER
            ) AS creator_fee_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
    ),
    v1_dbc_swap_events AS (
        SELECT
            p.account_quote_mint AS quote_mint,
            CAST(
                JSON_EXTRACT_SCALAR(
                    s.swap_result,
                    '$.SwapResult.trading_fee'
                ) AS DECIMAL(38,0)
            ) AS trading_fee,
            -- Default to 50% for v1 configs not in evtcreateconfigv2 (pre-August Meteora update)
            COALESCE(c.creator_fee_pct, 50) AS creator_fee_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_pools p
            ON s.config = p.account_config
        LEFT JOIN config_fees c
            ON s.config = c.config
        WHERE
            s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
            AND s.evt_block_time >= from_unixtime({{start}})
            AND s.evt_block_time <  from_unixtime({{end}})
            AND NOT EXISTS (
                SELECT 1
                FROM v2_fee_authorities fa
                WHERE fa.fee_authority = c.fee_claimer
                  AND s.evt_block_time >= fa.created_at
            )
            AND NOT EXISTS (
                SELECT 1
                FROM migrated_pools m
                WHERE m.account_config = s.config
                  AND s.evt_block_time >= m.migrated_at
            )
    ),
    v1_damm_claim_events AS (
        SELECT
            m.quote_mint,
            -- ClaimPositionFee reports the Bags-side revenue in lamports, so double it to reconstruct
            -- the total fee before reusing the existing 50/50 fee split in v1_revenue.
            CAST(f.fee_b_claimed AS DECIMAL(38,0)) * 2 AS trading_fee,
            50 AS creator_fee_pct
        FROM meteora_solana.cp_amm_evt_evtclaimpositionfee f
        JOIN migrated_pools m
            ON f.pool = m.account_pool
        WHERE
            f.owner = '{{tx_signer}}'
            AND f.evt_block_time >= from_unixtime({{start}})
            AND f.evt_block_time <  from_unixtime({{end}})
            AND f.evt_block_time >= m.migrated_at
            AND f.fee_b_claimed IS NOT NULL
    ),
    v1_fee_events AS (
        SELECT *
        FROM v1_dbc_swap_events

        UNION ALL

        SELECT *
        FROM v1_damm_claim_events
    ),
    v1_revenue AS (
        SELECT
            quote_mint,
            SUM(trading_fee) AS daily_fees,
            SUM(trading_fee * creator_fee_pct / 100) AS daily_protocol_revenue
            -- In Bags launchpad, the protocol is configured as the DBC creator. Therefore, protocol revenue is calculated as the creator share of the DBC trading fee and dbc config partner is configured as the token creator
            -- SUM(trading_fee * (100 - creator_fee_pct) / 100) AS daily_bags_creator_revenue
        FROM v1_fee_events
        GROUP BY quote_mint
    ),

    /* =========================
       FeeShare V2
       ========================= */
    v2_revenue AS (
        SELECT
            'So11111111111111111111111111111111111111112' AS quote_mint,
            SUM(
                CAST(accumulated AS DECIMAL(38,0))
            ) * 2 AS daily_fees,
            SUM(
                CAST(accumulated AS DECIMAL(38,0))
            ) AS daily_protocol_revenue
        FROM bags_solana.bags_fee_share_evt_platformaccumulatedevent
        WHERE
            accumulated IS NOT NULL
            AND evt_block_time >= from_unixtime({{start}})
            AND evt_block_time <  from_unixtime({{end}})
    )

/* =========================
   Final aggregation
   ========================= */
SELECT
    quote_mint,
    SUM(daily_fees) AS daily_fees,
    SUM(daily_protocol_revenue) AS daily_protocol_revenue
FROM (
    SELECT * FROM v1_revenue
    UNION ALL
    SELECT * FROM v2_revenue
) t
GROUP BY quote_mint
