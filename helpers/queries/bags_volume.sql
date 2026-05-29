WITH
    dbc_pools AS (
        SELECT DISTINCT
            account_base_mint AS token_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE
            call_tx_signer = '{{tx_signer}}'
            AND account_base_mint IS NOT NULL
    ),
    bags_trades AS (
        SELECT
            CASE
                WHEN sold.token_mint IS NOT NULL AND bought.token_mint IS NULL
                    THEN t.token_bought_mint_address
                WHEN bought.token_mint IS NOT NULL AND sold.token_mint IS NULL
                    THEN t.token_sold_mint_address
            END AS quote_mint,
            CASE
                WHEN sold.token_mint IS NOT NULL AND bought.token_mint IS NULL
                    THEN CAST(t.token_bought_amount_raw AS DECIMAL(38,0))
                WHEN bought.token_mint IS NOT NULL AND sold.token_mint IS NULL
                    THEN CAST(t.token_sold_amount_raw AS DECIMAL(38,0))
                ELSE CAST(0 AS DECIMAL(38,0))
            END AS volume_raw
        FROM dex_solana.trades t
        LEFT JOIN dbc_pools sold
            ON t.token_sold_mint_address = sold.token_mint
        LEFT JOIN dbc_pools bought
            ON t.token_bought_mint_address = bought.token_mint
        WHERE
            t.block_time >= from_unixtime({{start}})
            AND t.block_time <  from_unixtime({{end}})
            AND (
                (
                    sold.token_mint IS NOT NULL
                    AND bought.token_mint IS NULL
                    AND t.token_bought_mint_address = 'So11111111111111111111111111111111111111112'
                )
                OR (
                    bought.token_mint IS NOT NULL
                    AND sold.token_mint IS NULL
                    AND t.token_sold_mint_address = 'So11111111111111111111111111111111111111112'
                )
            )
    )

SELECT
    quote_mint,
    CAST(SUM(volume_raw) AS VARCHAR) AS daily_volume
FROM bags_trades
WHERE quote_mint IS NOT NULL
GROUP BY 1
