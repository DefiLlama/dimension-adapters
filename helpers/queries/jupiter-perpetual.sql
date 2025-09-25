WITH
    CONST AS (
        SELECT
            'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu' AS PERP_PROGRAM_ID,
            x'1bb299ba2fc48c2d' AS ADD_LIQUIDITY_EVENT,
            x'8dc7b67b9f5ed766' AS REMOVE_LIQUIDITY_EVENT,
            1e6 AS USD_DECIMALS,
            FROM_UNIXTIME({{start}}) AS start_time,
            FROM_UNIXTIME({{end}}) AS end_time
    ),
    -- Base liquidity operations with early filtering
    base_liquidity AS (
        SELECT
            position_change,
            date_trunc('day', block_time) AS day,
            fee_usd
        FROM
            (
                -- Deposits
                SELECT
                    'deposit' AS position_change,
                    block_time,
                    (
                        bytearray_to_bigint (
                            bytearray_reverse (bytearray_substring (data, 105, 8))
                        )-bytearray_to_bigint (
                            bytearray_reverse (bytearray_substring (data, 129, 8))
                        )
                    )/CONST.USD_DECIMALS AS fee_usd
                FROM
                    solana.instruction_calls,
                    CONST
                WHERE
                    executing_account=CONST.PERP_PROGRAM_ID
                    AND bytearray_substring (data, 9, 8)=CONST.ADD_LIQUIDITY_EVENT
                    AND tx_success=TRUE
                    AND block_time>=FROM_UNIXTIME({{start}})
                    AND block_time<=FROM_UNIXTIME({{end}})
                UNION ALL
                -- Withdrawals
                SELECT
                    'withdraw' AS position_change,
                    block_time,
                    (
                        bytearray_to_bigint (
                            bytearray_reverse (bytearray_substring (data, 89, 8))
                        )/CONST.USD_DECIMALS
                    )*(
                        1.0-CAST(
                            bytearray_to_bigint (
                                bytearray_reverse (bytearray_substring (data, 113, 8))
                            ) AS DOUBLE
                        )/CAST(
                            bytearray_to_bigint (
                                bytearray_reverse (bytearray_substring (data, 105, 8))
                            ) AS DOUBLE
                        )
                    ) AS fee_usd
                FROM
                    solana.instruction_calls,
                    CONST
                WHERE
                    executing_account=CONST.PERP_PROGRAM_ID
                    AND bytearray_substring (data, 9, 8)=CONST.REMOVE_LIQUIDITY_EVENT
                    AND tx_success=TRUE
                    AND block_time>=FROM_UNIXTIME({{start}})
                    AND block_time<FROM_UNIXTIME({{end}})
            ) sub
    ),
    -- Aggregate pool fees by day
    pool_fees_daily AS (
        SELECT
            day,
            SUM(fee_usd) AS pool_fees
        FROM
            base_liquidity
        GROUP BY
            1
    ),
    -- Optimized swap fees with early date filtering
    jup_perp_swaps_mat AS (
        SELECT
            to_base58 (bytearray_substring (data, 1+16, 32)) as custody_key_in,
            to_base58 (bytearray_substring (data, 1+48, 32)) as custody_key_out,
            to_base58 (bytearray_substring (data, 1+80, 32)) as pool_key,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+112, 8))
            ) as amount_in,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+112+8, 8))
            ) as amount_out,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+112+8+8, 8))
            ) as amount_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+112+8+8+8, 8))
            ) as amount_out_post_fee,
            COALESCE(p.price, dp.median_price) as price,
            tk.symbol,
            tk.decimals,
            data,
            block_slot,
            block_time,
            tx_id
        FROM
            solana.instruction_calls ic
            LEFT JOIN jupiter_solana.perpetuals_call_addCustody out_mint ON out_mint.account_custody=to_base58 (bytearray_substring (data, 1+48, 32)) --out
            LEFT JOIN tokens_solana.fungible tk ON tk.token_mint_address=out_mint.account_custodyTokenMint
            LEFT JOIN prices.usd p ON p.blockchain='solana'
            and toBase58 (p.contract_address)=out_mint.account_custodyTokenMint
            and p.minute=date_trunc('minute', ic.block_time)
            LEFT JOIN dune.dune.result_dex_prices_solana dp ON dp.token_mint_address=out_mint.account_custodyTokenMint
            and date_trunc('day', ic.block_time)=dp.day
            and dp.rolling_two_months_trades>1000
            and dp.total_holders_ever>5000
        WHERE
            executing_account='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
            AND bytearray_substring (data, 1+8, 8)=0x286bd41adf8827dc -- PoolSwapEvent
            AND tx_success=true
            AND block_time>=FROM_UNIXTIME({{start}})
            AND block_time<FROM_UNIXTIME({{end}})
    ),
    -- Swap fees by day
    swap_fees_daily AS (
        SELECT
            date_trunc('day', block_time) AS day,
            SUM(
                price*(amount_out-amount_out_post_fee)/POW(10, decimals)
            ) AS swap_fees
        FROM
            jup_perp_swaps_mat
        GROUP BY
            1
    ),
    -- Position fees using decoded events table
    position_fees_daily AS (
        SELECT
            date_trunc('day', block_time) AS day,
            SUM(CASE WHEN position_change = 'liquidate' THEN liq_fee_usd ELSE 0 END) AS liq_fees,
            SUM(CASE WHEN position_change IN ('increase', 'decrease') THEN fee_usd ELSE 0 END) AS other_fees
        FROM
            jupiter_solana.perp_events
        WHERE
            block_time>=FROM_UNIXTIME({{start}})
            AND block_time<FROM_UNIXTIME({{end}})
        GROUP BY
            1
    )
SELECT
    COALESCE(pf.day, sf.day, posf.day) as day,
    COALESCE(pf.pool_fees, 0) AS pool_fees,
    COALESCE(sf.swap_fees, 0) AS swap_fees,
    COALESCE(posf.liq_fees, 0) AS liquidation_fees,
    COALESCE(posf.other_fees, 0) AS position_fees,
    (
        COALESCE(pf.pool_fees, 0) + 
        COALESCE(sf.swap_fees, 0) + 
        COALESCE(posf.liq_fees, 0) + 
        COALESCE(posf.other_fees, 0)
    ) AS total_fees
FROM
    pool_fees_daily pf
    FULL OUTER JOIN swap_fees_daily sf ON pf.day = sf.day
    FULL OUTER JOIN position_fees_daily posf ON COALESCE(pf.day, sf.day) = posf.day
WHERE
    COALESCE(pf.day, sf.day, posf.day) IS NOT NULL
ORDER BY
    day; 