WITH
    -- Base Chain Calculations
    base_contracts_filtered AS (
        -- Old token launcher
        SELECT
            varbinary_ltrim (varbinary_substring (data, 33, 32)) as token_address
        FROM
            base.logs
        WHERE
            contract_address=0x94Bf9622348Cf5598D9A491Fa809194Cf85A0D61
            AND topic0=0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
        UNION ALL
        -- 2nd old token launcher
        SELECT
            varbinary_ltrim (varbinary_substring (data, 33, 32)) as token_address
        FROM
            base.logs
        WHERE
            contract_address=0x5706d5A36c2Cc90a6d46E851efCb3C6Ac0372EB2
            AND topic0=0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
        UNION ALL
        -- Bonding contract
        SELECT
            varbinary_ltrim (varbinary_substring (data, 33, 32)) as token_address
        FROM
            base.logs
        WHERE
            contract_address=0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533
            AND topic0=0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
        UNION ALL
        -- New token launcher pumpfun
        SELECT
            varbinary_ltrim (topic1) as token_address
        FROM
            base.logs
        WHERE
            contract_address=0xF66DeA7b3e897cD44A5a231c61B6B4423d613259
            AND topic0=0x714aa39317ad9a7a7a99db52b44490da5d068a0b2710fffb1a1282ad3cadae1f
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
        UNION ALL
        -- LUNA address
        SELECT
            token_address
        FROM
            (
                VALUES
                    (0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4)
            ) as t (token_address)
    ),
    virtual_price_for_period AS (
        SELECT
            SUM(amount_usd)/SUM(token_bought_amount) AS avg_price
        FROM
            dex.trades
        WHERE
            token_bought_address=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b -- VIRTUAL token address
            AND blockchain='base'
            AND amount_usd>0
            AND token_bought_amount>0
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
            AND block_time>CAST('2023-10-16' AS TIMESTAMP) -- Original filter, adjust if needed
    ),
    base_virtual_trades_volume_sum AS (
        SELECT
            SUM(
                CASE
                    WHEN token_bought_address=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b THEN token_bought_amount
                    ELSE token_sold_amount
                END
            )*COALESCE(
                (
                    SELECT
                        avg_price
                    FROM
                        virtual_price_for_period
                ),
                0
            ) as total_virtual_volume_usd
        FROM
            dex.trades
        WHERE
            (
                (
                    token_bought_address IN (
                        SELECT
                            token_address
                        FROM
                            base_contracts_filtered
                    )
                    AND token_sold_address=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
                )
                OR (
                    token_sold_address IN (
                        SELECT
                            token_address
                        FROM
                            base_contracts_filtered
                    )
                    AND token_bought_address=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
                )
            )
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
            AND block_time>CAST('2023-10-16' AS TIMESTAMP)
    ),
    base_other_trades_volume_sum AS (
        SELECT
            SUM(amount_usd) as total_other_volume_usd
        FROM
            dex.trades
        WHERE
            (
                (
                    token_bought_address IN (
                        SELECT
                            token_address
                        FROM
                            base_contracts_filtered
                    )
                    AND token_sold_address!=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
                )
                OR (
                    token_sold_address IN (
                        SELECT
                            token_address
                        FROM
                            base_contracts_filtered
                    )
                    AND token_bought_address!=0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
                )
            )
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
            AND block_time>CAST('2023-10-16' AS TIMESTAMP)
    ),
    base_chain_total_volume AS (
        SELECT
            'base' as chain,
            COALESCE(
                (
                    SELECT
                        total_virtual_volume_usd
                    FROM
                        base_virtual_trades_volume_sum
                ),
                0
            )+COALESCE(
                (
                    SELECT
                        total_other_volume_usd
                    FROM
                        base_other_trades_volume_sum
                ),
                0
            ) as volume_usd
    ),
    -- Solana Chain Calculations
    hour_sol_price_filtered AS (
        SELECT
            date_trunc('hour', minute) as hour_time,
            AVG(price) as price
        FROM
            prices.usd
        WHERE
            symbol='SOL'
            AND blockchain='solana'
            AND minute>=from_unixtime({{startTimestamp}})
            AND minute<=from_unixtime({{endTimestamp}})
            AND minute>CAST('2023-10-15' AS TIMESTAMP)
        GROUP BY
            1
    ),
    sol_agent_swaps_filtered AS (
        SELECT
            tx_id,
            abs(token_balance_change) as token_swap_amt
        FROM
            solana.account_activity
        WHERE
            token_balance_owner='GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'
            AND token_mint_address IN (
                '9se6kma7LeGcQWyRBNcYzyxZPE3r9t9qWZ8SnjnN3jJ7', -- LUNA
                'JCKqVrB4cKRFGKFYTMuYzry8QVCgaxS6g5s3HbczCP5W', -- SAM
                '5SzHH6NKpByimEpb8SrgkZhe6MgKmmuUgLTRJHMp6C48', -- AIRENE
                '14zP2ToQ79XWvc7FQpm4bRnp9d6Mp1rFfsUW3gpLcRX' -- AIXBT
            )
            AND block_time>=from_unixtime({{startTimestamp}})
            AND block_time<=from_unixtime({{endTimestamp}})
            AND block_time>CAST('2023-10-15' AS TIMESTAMP)
    ),
    sol_swaps_for_volume_calc AS (
        SELECT
            s_act.block_time,
            abs(s_act.token_balance_change) as sol_amount
        FROM
            solana.account_activity s_act
            INNER JOIN sol_agent_swaps_filtered sasf ON s_act.tx_id=sasf.tx_id -- Ensure we only consider txns from agent swaps
        WHERE
            s_act.token_balance_owner='GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'
            AND s_act.token_mint_address='So11111111111111111111111111111111111111112' -- SOL mint address
            AND s_act.block_time>=from_unixtime({{startTimestamp}})
            AND s_act.block_time<=from_unixtime({{endTimestamp}})
            AND s_act.block_time>CAST('2023-10-15' AS TIMESTAMP)
    ),
    solana_chain_total_volume AS (
        SELECT
            'solana' as chain,
            SUM(ssvc.sol_amount*hspf.price) as volume_usd
        FROM
            sol_swaps_for_volume_calc ssvc
            LEFT JOIN hour_sol_price_filtered hspf ON date_trunc('hour', ssvc.block_time)=hspf.hour_time
    )
    -- Final Combined Output
SELECT
    chain,
    COALESCE(volume_usd, 0)*0.01 as fees_usd
FROM
    (
        SELECT
            *
        FROM
            base_chain_total_volume
        UNION ALL
        SELECT
            *
        FROM
            solana_chain_total_volume
    ) AS combined_volumes;