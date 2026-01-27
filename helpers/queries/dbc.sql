WITH
    dbc_tokens AS (
        SELECT DISTINCT
            account_config,
            account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE call_tx_signer = '{{tx_signer}}'
    ),
    swap_events AS (
        SELECT
            s.config,
            t.account_quote_mint,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_tokens t ON s.config = t.account_config
        WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
            AND s.evt_block_time >= from_unixtime({{start}})
            AND s.evt_block_time < from_unixtime({{end}})
    )
SELECT
    account_quote_mint as quote_mint,
    SUM(COALESCE(trading_fee, 0)) AS total_trading_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
FROM swap_events
GROUP BY account_quote_mint