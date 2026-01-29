WITH
    /* =========================
       FeeShare V1 and direct
       ========================= */
    v2_fee_authorities AS (
        SELECT DISTINCT
            to_base58(bytearray_substring(data, 121, 32)) AS fee_authority
        FROM solana.instruction_calls
        WHERE
            block_slot > 385570223
            AND executing_account = 'FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK'
            AND bytearray_substring(data, 1, 16)
                = 0xe445a52e51cb9a1d794900d9affc93c1
    ),

    dbc_pools AS (
        SELECT DISTINCT
            account_config,
            account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE call_tx_signer = '{{tx_signer}}'
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

    v1_swap_events AS (
        SELECT
            p.account_quote_mint AS quote_mint,
            CAST(
                JSON_EXTRACT_SCALAR(
                    s.swap_result,
                    '$.SwapResult.trading_fee'
                ) AS DECIMAL(38,0)
            ) AS trading_fee,
            COALESCE(c.creator_fee_pct, 0) AS creator_fee_pct
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
            )
    ),

    v1_revenue AS (
        SELECT
            quote_mint,
            SUM(trading_fee) AS daily_fees,
            SUM(trading_fee * (100 - creator_fee_pct) / 100) AS daily_protocol_revenue
        FROM v1_swap_events
        GROUP BY quote_mint
    ),

    /* =========================
       FeeShare V2
       ========================= */
    v2_revenue AS (
        SELECT
            'So11111111111111111111111111111111111111112' AS quote_mint,
            SUM(
                bytearray_to_uint256(
                    bytearray_reverse(
                        bytearray_substring(data, 153, 8)
                    )
                )
            ) * 2 AS daily_fees,
            SUM(
                bytearray_to_uint256(
                    bytearray_reverse(
                        bytearray_substring(data, 153, 8)
                    )
                )
            ) AS daily_protocol_revenue
        FROM solana.instruction_calls
        WHERE
            block_slot > 385570223
            AND executing_account = 'FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK'
            AND bytearray_substring(data, 1, 16)
                = 0xe445a52e51cb9a1d876d797eab3e764c
            AND bytearray_to_bigint(
                bytearray_reverse(
                    bytearray_substring(data, 17, 8)
                )
            ) >= {{start}}
            AND bytearray_to_bigint(
                bytearray_reverse(
                    bytearray_substring(data, 17, 8)
                )
            ) < {{end}}
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
GROUP BY quote_mint;
