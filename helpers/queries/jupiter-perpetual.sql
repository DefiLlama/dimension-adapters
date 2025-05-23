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
                    AND block_time>=CONST.start_time
                    AND block_time<CONST.end_time
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
                    AND block_time>=CONST.start_time
                    AND block_time<CONST.end_time
            ) sub
    ),
    -- Aggregate pool fees by day with early aggregation
    pool_fees_daily AS (
        SELECT
            day,
            SUM(fee_usd) AS pool_fees
        FROM
            base_liquidity
        GROUP BY
            1
    ),
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
            -- AND bytearray_substring(data,1,8) = 0xe445a52e51cb9a1d
            AND bytearray_substring (data, 1+8, 8)=0x286bd41adf8827dc -- PoolSwapEvent
            AND tx_success=true
            -- AND block_time >= DATE_TRUNC('day', NOW() - INTERVAL '90' day)
            -- AND tx_id = 'vXNpQ1z5dbqh97xHK3uMsiH5PZR5ERSAKdpLRb3ehKKXBWUnLeaWuPAQaWycLWUYKV3eefXrks1cmYacVkkkTGu'
            -- and block_slot = 241516777
    ),
    -- Pre-filtered swap fees with early date filtering
    swap_fees_daily AS (
        SELECT
            date_trunc('day', block_time) AS day,
            SUM(
                price*(amount_out-amount_out_post_fee)/POW(10, decimals)
            ) AS swap_fees
        FROM
            jup_perp_swaps_mat,
            CONST
        WHERE
            block_time>=CONST.start_time
            AND block_time<CONST.end_time
        GROUP BY
            1
    ),
    jup_perp_position_change_volume AS (
        SELECT
            'increase' AS position_change,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+291, 8))
            )/1e6 as size_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+299, 8))
            )/1e6 as collateral_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+307, 8))
            ) as collateral_token,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+340, 8))
            )/1e6 as fee_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+315, 8))
            )/1e6 as price_usd,
            null as liq_fee_usd,
            null as pnl_direction,
            null as pnl_usd,
            to_base58 (bytearray_substring (data, 1+227, 32)) as owner,
            to_base58 (bytearray_substring (data, 1+16, 32)) as position_key,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+16+32, 1))
            ) as position_side,
            to_base58 (bytearray_substring (data, 1+16+32+1, 32)) as custody_position_key,
            to_base58 (bytearray_substring (data, 1+16+32+1+32, 32)) as custody_collateral_key,
            block_slot,
            block_time,
            tx_id
        FROM
            solana.instruction_calls
        WHERE
            executing_account='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
            AND bytearray_substring (data, 1+8, 8)=0xf5715534d6bb9984 -- IncreasePosition
            AND tx_success=true
        UNION ALL
        SELECT
            'decrease' AS position_change,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+292, 8))
            )/1e6 as size_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+300, 8))
            )/1e6 as collateral_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+309, 8))
            ) as collateral_token,
            case
                when bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 1+325, 1))
                )=1 then bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 1+334, 8))
                )/1e6
                else bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 1+326, 8))
                )/1e6
            end as fee_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+317, 8))
            )/1e6 as price_usd,
            null as liq_fee_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+219, 1))
            ) as pnl_direction,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+220, 8))
            )/1e6 as pnl_usd,
            to_base58 (bytearray_substring (data, 1+228, 32)) as owner,
            to_base58 (bytearray_substring (data, 1+16, 32)) as position_key,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+16+32, 1))
            ) as position_side,
            to_base58 (bytearray_substring (data, 1+16+32+1, 32)) as custody_position_key,
            to_base58 (bytearray_substring (data, 1+16+32+1+32, 32)) as custody_collateral_key,
            block_slot,
            block_time,
            tx_id
        FROM
            solana.instruction_calls
        WHERE
            executing_account='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
            AND bytearray_substring (data, 1+8, 8)=0x409c2b4a6d83107f -- DecreasePosition
            AND tx_success=true
        UNION ALL
        -- LiquidatePositionEvent (there is also a LiquidateFullPositionEvent)
        SELECT
            'liquidate' AS position_change,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+177, 8))
            )/1e6 as size_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+258, 8))
            )/1e6 as collateral_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+266, 8))
            ) as collateral_token,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+282, 8))
            )/1e6 as fee_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+274, 8))
            )/1e6 as price_usd,
            case
                when bytearray_substring (data, 1+8, 8)=0x806547a880485654 then bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 1+290, 8))
                )/1e6
                else 0
            end as liq_fee_usd,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+185, 1))
            ) as pnl_direction,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+186, 8))
            )/1e6 as pnl_usd,
            to_base58 (bytearray_substring (data, 1+194, 32)) as owner,
            to_base58 (bytearray_substring (data, 1+16, 32)) as position_key,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (data, 1+16+32, 1))
            ) as position_side,
            to_base58 (bytearray_substring (data, 1+16+32+1, 32)) as custody_position_key,
            to_base58 (bytearray_substring (data, 1+16+32+1+32, 32)) as custody_collateral_key,
            block_slot,
            block_time,
            tx_id
        FROM
            solana.instruction_calls
        WHERE
            executing_account='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'
            AND bytearray_substring (data, 1+8, 8) IN (0x68452084d423bf2f, 0x806547a880485654) --LiquidatePosition, LiquidateFullPosition
            AND tx_success=true
    ),
    -- Pre-filtered main query data with early date filtering
    main_fees AS (
        SELECT
            date_trunc('day', block_time) AS day,
            SUM(liq_fee_usd) AS liq_fees,
            SUM(fee_usd) AS other_fees
        FROM
            jup_perp_position_change_volume,
            CONST
        WHERE
            block_time>=CONST.start_time
            AND block_time<CONST.end_time
        GROUP BY
            1
    )
SELECT
    COALESCE(m.day, p.day, s.day) as day,
    (
        COALESCE(m.liq_fees, 0)+COALESCE(m.other_fees, 0)+COALESCE(p.pool_fees, 0)+COALESCE(s.swap_fees, 0)
    ) AS total_fees
FROM
    main_fees m
    FULL OUTER JOIN pool_fees_daily p ON m.day=p.day
    FULL OUTER JOIN swap_fees_daily s ON m.day=s.day
WHERE
    COALESCE(m.day, p.day, s.day) IS NOT NULL
ORDER BY
    day;