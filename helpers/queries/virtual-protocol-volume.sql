-- Virtual Protocol bonding-curve trading volume, self-contained (no private tables).
-- Only PRE-graduation (bonding-curve) volume is counted: the bonding curve is Virtual
-- Protocol's own venue. Post-graduation trades happen on third-party DEXs (e.g. Uniswap),
-- which DefiLlama already counts under those DEXs, so including them would double-count.
--
-- Bonding pairs are reconstructed on-chain from bonding-factory events:
--   * Current generation (Base 0x1A5400..., all Robinhood): PreLaunched (0xb9ee...) /
--     Launched (0x6ed5...), where pair (FPair) = topic2.
--   * Legacy Base FFactories (0xd7d3c85b..., 0x158d7cca...): PairCreated (0x0d3648bd...,
--     the Uniswap-V2 signature, hence scoped to those two factory addresses),
--     where pair = first data word.
-- Combined this covers ~100% of the internal registry (52,979/52,981 Base, 4,905/4,905 RH;
-- verified 2026-07) and is in fact more complete than the registry.
--
-- Volume = FPair Swap logs (topic0 0x298c349c) on those pairs. token1 = VIRTUAL, so the
-- VIRTUAL leg is data words 3 + 4 (amount1In + amount1Out; verified against on-chain VIRTUAL
-- transfers). VIRTUAL amounts are returned in token units and priced to USD by the adapter.
--
-- Solana's venue is Virtual Protocol's Meteora Dynamic Bonding Curve. A fresh DBC config is
-- created per agent launch, each quoted in VIRTUAL, so the config is the Solana equivalent of a
-- factory: evtCreateConfig/V2 where quote_mint = VIRTUAL -> evtSwap on those configs. Volume is
-- the VIRTUAL leg, 9 decimals, taken gross to match what dex_solana.trades reports.
-- Post-graduation trading (Meteora DAMM v2) is excluded as on EVM, as is pre-DBC activity.
WITH
    base_pairs AS (
        -- Current factory (0x1A5400...): PreLaunched/Launched, pair = topic2
        SELECT DISTINCT varbinary_substring(topic2, 13, 20) as pair
        FROM base.logs
        WHERE topic0 IN (
            0xb9ee8aa6d909a3efd0bf1b0bc2bde7f998f7ad30178b0d45f9227f5382cebc8f,
            0x6ed5dc54f1333f448f2cdf7a6efc675343f880035d6f647fb7f6e9cbf8959718
        )
        AND block_time >= timestamp '2024-10-01'
        AND block_time <= from_unixtime({{endTimestamp}})

        UNION  -- distinct pairs across both factory generations

        -- Legacy FFactories: PairCreated(token0, token1=VIRTUAL, pair, n).
        -- Uniswap-V2-style signature, so scope to the two Virtual Protocol FFactory
        -- addresses; pair = first data word.
        SELECT DISTINCT varbinary_substring(data, 13, 20) as pair
        FROM base.logs
        WHERE contract_address IN (
            0xd7d3c85b4f2e9bee1998cd2e98820e647792d284,
            0x158d7ccaa23dc3c8861c3323ed546e3d25e74309
        )
        AND topic0 = 0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9
        AND block_time >= timestamp '2024-10-01'
        AND block_time <= from_unixtime({{endTimestamp}})
    ),
    rh_pairs AS (
        SELECT DISTINCT varbinary_substring(topic2, 13, 20) as pair
        FROM robinhood.logs
        WHERE topic0 IN (
            0xb9ee8aa6d909a3efd0bf1b0bc2bde7f998f7ad30178b0d45f9227f5382cebc8f,
            0x6ed5dc54f1333f448f2cdf7a6efc675343f880035d6f647fb7f6e9cbf8959718
        )
        AND block_time >= timestamp '2026-07-01'
        AND block_time <= from_unixtime({{endTimestamp}})
    ),

    base_bonding AS (
        SELECT COALESCE(SUM(
            (cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
             + cast(bytearray_to_uint256(bytearray_substring(l.data, 97, 32)) as double)) / 1e18
        ), 0) as virtual_volume
        FROM base.logs l
        JOIN base_pairs p ON l.contract_address = p.pair
        WHERE l.topic0 = 0x298c349c742327269dc8de6ad66687767310c948ea309df826f5bd103e19d207
        -- half-open [start, end) so a boundary-instant swap is not counted in two days
        AND l.block_time >= from_unixtime({{startTimestamp}})
        AND l.block_time < from_unixtime({{endTimestamp}})
    ),
    rh_bonding AS (
        SELECT COALESCE(SUM(
            (cast(bytearray_to_uint256(bytearray_substring(l.data, 65, 32)) as double)
             + cast(bytearray_to_uint256(bytearray_substring(l.data, 97, 32)) as double)) / 1e18
        ), 0) as virtual_volume
        FROM robinhood.logs l
        JOIN rh_pairs p ON l.contract_address = p.pair
        WHERE l.topic0 = 0x298c349c742327269dc8de6ad66687767310c948ea309df826f5bd103e19d207
        AND l.block_time >= from_unixtime({{startTimestamp}})
        AND l.block_time < from_unixtime({{endTimestamp}})
    ),

    sol_configs AS (
        -- DBC is permissionless, so quote_mint alone is not an ownership boundary: a second
        -- party has already created VIRTUAL-quoted configs (GrnTP8qz…, 4 configs on 2026-08-18,
        -- no shared signer, no pools launched). fee_claimer is the partner authority fixed at
        -- config creation; Virtual Protocol has used one throughout (111 configs, 2026-08-21
        -- onward). If it is ever rotated this undercounts loudly rather than overcounting
        -- silently, which is the safer way round.
        SELECT config
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfig
        WHERE quote_mint  = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
        AND   fee_claimer = 'AamUJY5hvSPCcpw2e6mzCuMsxrdQKVnN8iFeYKSZNFcf'

        -- UNION, not UNION ALL: every config is emitted into both tables, so ALL doubles it
        UNION

        SELECT config
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
        WHERE quote_mint  = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
        AND   fee_claimer = 'AamUJY5hvSPCcpw2e6mzCuMsxrdQKVnN8iFeYKSZNFcf'
    ),
    sol_bonding AS (
        SELECT COALESCE(SUM(
            -- buy = VIRTUAL in, sell = VIRTUAL out. amount_in, NOT actual_input_amount:
            -- the latter is net of the fee taken off the quote side before the curve.
            CASE WHEN s.trade_direction = 1
                 THEN cast(s.amount_in as double)
                 ELSE cast(json_extract_scalar(s.swap_result, '$.SwapResult.output_amount') as double)
            END
        ) / 1e9, 0) as virtual_volume
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN sol_configs c ON s.config = c.config
        -- evt_block_date is the partition column; bound it as well as the timestamp
        WHERE s.evt_block_date >= cast(from_unixtime({{startTimestamp}}) as date)
        AND s.evt_block_date <= cast(from_unixtime({{endTimestamp}}) as date)
        AND cast(s.evt_block_time as timestamp) >= from_unixtime({{startTimestamp}})
        AND cast(s.evt_block_time as timestamp) < from_unixtime({{endTimestamp}})
    )

SELECT 'base' as chain, (SELECT virtual_volume FROM base_bonding) as virtual_volume
UNION ALL
SELECT 'robinhood' as chain, (SELECT virtual_volume FROM rh_bonding) as virtual_volume
UNION ALL
SELECT 'solana' as chain, (SELECT virtual_volume FROM sol_bonding) as virtual_volume
