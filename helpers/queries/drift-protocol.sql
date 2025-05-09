with
    program_logged as (
        SELECT
            block_date,
            block_time,
            --only get the outer instruction invoke at depth 1
            coalesce(
                CASE
                    WHEN logs LIKE 'Program%%invoke [%' then split(log_messages.logs, ' ') [2]
                    else null
                end,
                lag(
                    CASE
                        WHEN logs LIKE 'Program%%invoke [%' then split(log_messages.logs, ' ') [2]
                        else null
                    end,
                    1
                ) IGNORE NULLS OVER (
                    partition by
                        id
                    ORDER BY
                        log_index asc
                )
            ) as program_invoked
            -- , sum(CASE WHEN logs LIKE 'Program%%invoke [%' then 1 else null end) over (partition by id order by log_index asc) as program_invoke_index
,
            log_index,
            log_messages.logs,
            id
        FROM
            solana.transactions tx
            LEFT JOIN unnest (log_messages)
        WITH
            ORDINALITY as log_messages (logs, log_index) ON True
        WHERE
            success=true
            and contains(
                account_keys,
                'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'
            )
            AND block_time>=from_unixtime({{start}})
            AND block_time<=from_unixtime({{end}})
    ),
    logs_hex as (
        SELECT
            from_base64(split(logs, ' ') [3]) as hex_data,
            split(logs, ' ') [3] as base64_data,
*
        FROM
            program_logged
        WHERE
            (
                logs LIKE '%Program log:%'
                or logs LIKE '%Program data:%'
            )
            --do regex match instead later for logs LIKE '%Program data:%' too
            and cardinality(split(logs, ' '))=3 --Program log: somedata
            AND try(from_base64(split(logs, ' ') [3])) is not null --valid hex
            and program_invoked IN (
                'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
                'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',
                'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
                'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            )
            and bytearray_substring (from_base64(split(logs, ' ') [3]), 1, 8)=0xe0344347c2ed6d01
    ),
    CTE as (
        SELECT
            bytearray_substring (hex_data, 1, 8) as discriminator,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (hex_data, 9, 8))
            ) as ts,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (hex_data, 17, 1))
            ) as order_action --Place, Cancel, Fill, Trigger, Expire
,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (hex_data, 18, 1))
            ) as order_action_explanation,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (hex_data, 19, 2))
            ) as market_index,
            bytearray_to_bigint (
                bytearray_reverse (bytearray_substring (hex_data, 21, 1))
            ) as market_type,
            case
                when bytearray_substring (hex_data, 22, 1)=0x01 then toBase58 (bytearray_substring (hex_data, 23, 32)) --add 32 bytes for pubkey
                else null
            end as filler,
            case
                when bytearray_substring (
                    hex_data,
                    23+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end,
                    1
                )=0x01 then bytearray_to_bigint (
                    bytearray_reverse (
                        bytearray_substring (
                            hex_data,
                            24+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            8
                        )
                    )
                )/1e6 --add 8 bytes for u64
                else null
            end as filler_reward,
            case
                when bytearray_substring (
                    hex_data,
                    24+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    1
                )=0x01 then bytearray_substring (
                    hex_data,
                    25+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    8
                ) --add 8 bytes for u64 
                else null
            end as fill_record_id,
            case
                when bytearray_substring (
                    hex_data,
                    25+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            24+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    1
                )=0x01 then bytearray_to_bigint (
                    bytearray_reverse (
                        bytearray_substring (
                            hex_data,
                            26+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            8
                        )
                    )
                )/1e9 --add 8 bytes for u64
                else null
            end as base_asset_amount_filled,
            case
                when bytearray_substring (
                    hex_data,
                    26+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            24+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            25+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    1
                )=0x01 then bytearray_to_bigint (
                    bytearray_reverse (
                        bytearray_substring (
                            hex_data,
                            27+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end --filler
                            --filler_reward
+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end
                            --fill_record_id
+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end
                            --base_asset_amount_filled
+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            8
                        )
                    )
                )/1e6 --add 8 bytes for u64
                else null
            end as quote_asset_amount_filled,
            case
                when bytearray_substring (
                    hex_data,
                    27+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            24+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            25+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            26+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    1
                )=0x01 then bytearray_to_bigint (
                    bytearray_reverse (
                        bytearray_substring (
                            hex_data,
                            28+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    26+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            25+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    24+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            8
                        )
                    )
                )/1e6 --add 8 for u64 
                else null
            end as taker_fee,
            case
                when bytearray_substring (
                    hex_data,
                    28+case
                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            23+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            24+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            25+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            26+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end+case
                        when bytearray_substring (
                            hex_data,
                            27+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    26+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            25+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    24+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            1
                        )=0x01 then 8
                        else 0
                    end,
                    1
                )=0x01 then bytearray_to_bigint (
                    bytearray_reverse (
                        bytearray_substring (
                            hex_data,
                            29+case
                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    23+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    24+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    25+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    26+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            25+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    24+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end+case
                                when bytearray_substring (
                                    hex_data,
                                    27+case
                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            23+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            24+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            25+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    24+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end+case
                                        when bytearray_substring (
                                            hex_data,
                                            26+case
                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    23+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    24+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end+case
                                                when bytearray_substring (
                                                    hex_data,
                                                    25+case
                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            23+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end+case
                                                        when bytearray_substring (
                                                            hex_data,
                                                            24+case
                                                                when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                else 0
                                                            end+case
                                                                when bytearray_substring (
                                                                    hex_data,
                                                                    23+case
                                                                        when bytearray_substring (hex_data, 22, 1)=0x01 then 32
                                                                        else 0
                                                                    end,
                                                                    1
                                                                )=0x01 then 8
                                                                else 0
                                                            end,
                                                            1
                                                        )=0x01 then 8
                                                        else 0
                                                    end,
                                                    1
                                                )=0x01 then 8
                                                else 0
                                            end,
                                            1
                                        )=0x01 then 8
                                        else 0
                                    end,
                                    1
                                )=0x01 then 8
                                else 0
                            end,
                            8
                        )
                    )
                )/1e6 --add 8 for u64 makerfee                                     
                else null
            end as maker_fee,
            block_time,
            block_date
        FROM
            logs_hex
    )
SELECT
    SUM(
        CASE
            WHEN market_type=1 then quote_asset_amount_filled
            else 0
        END
    ) as perpetual_volume,
    SUM(
        CASE
            WHEN market_type=0 then quote_asset_amount_filled
            else 0
        END
    ) as spot_volume,
    SUM(taker_fee)+SUM(maker_fee)-SUM(filler_reward)-SUM(
        CASE
            WHEN order_action_explanation=15
            or order_action_explanation=13 then (quote_asset_amount_filled)/5000
            else 0
        END
    ) as total_revenue,
    SUM(taker_fee) as total_taker_fee
FROM
    CTE
WHERE
    order_action=2