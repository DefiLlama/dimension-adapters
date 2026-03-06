WITH
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
            CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_trading_fee_percentage') AS INTEGER) AS creator_fee_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
    ),
    swap_events AS (
        SELECT
            s.config,
            p.account_quote_mint,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee,
            COALESCE(c.creator_fee_pct, 0) AS creator_fee_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_pools p ON s.config = p.account_config
        LEFT JOIN config_fees c ON s.config = c.config
        WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
            AND s.evt_block_time >= from_unixtime({{start}})
            AND s.evt_block_time < from_unixtime({{end}})
    )
SELECT
    account_quote_mint AS quote_mint,
    SUM(COALESCE(trading_fee, 0)) AS total_trading_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees,
    SUM(COALESCE(trading_fee * (100 - creator_fee_pct) / 100, 0)) AS total_partner_trading_fees
FROM swap_events
GROUP BY account_quote_mint
