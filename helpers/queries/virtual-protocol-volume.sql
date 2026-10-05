-- Virtual Protocol bonding-curve trading volume on Solana (the EVM chains are read from logs in
-- dexs/virtual-protocol.ts). Only PRE-graduation (bonding-curve) volume is counted: the bonding
-- curve is Virtual Protocol's own venue. Post-graduation trades happen on third-party DEXs, which
-- DefiLlama already counts under those DEXs, so including them would double-count.
--
-- Solana has had two Virtual Protocol venues and both are counted. From 2026-08-21 it is their
-- Meteora Dynamic Bonding Curve: a fresh config per agent launch, each quoted in VIRTUAL, so the
-- config is the Solana equivalent of a factory -- evtCreateConfig/V2 scoped by quote_mint AND
-- fee_claimer -> evtSwap on those configs. Before that, from 2025-02, it was Virtual Protocol's
-- own bonding program, which Dune does not decode; its pools are recovered from the tax paid in
-- each swap (see sol_prebond). Volume is the VIRTUAL leg, 9 decimals, net of the quote-side fee
-- on both legs to match the EVM arms.
-- Post-graduation trading (Meteora DAMM v2) is excluded as on EVM.
WITH
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
            -- Both legs net of the quote-side fee, so they mean the same thing and match the EVM
            -- arms (which read what reached the pool after the tax). actual_input_amount, NOT
            -- amount_in: at the 99% launch cliff amount_in is mostly fee (13.8% of 2026-08-24).
            CASE WHEN s.trade_direction = 1
                 THEN cast(json_extract_scalar(s.swap_result, '$.SwapResult.actual_input_amount') as double)
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
    ,
    -- Solana's first bonding venue, before DBC: Virtual Protocol's own program, live 2025-02 to
    -- 2026-08-21. Dune does not decode it, so there are no swap events to read -- as with
    -- Robinhood's FPair bonding, which is why that arm reads raw logs. Pools are instead found
    -- from the tax: every swap paid ~1% to the collector in the same tx and the payer is always
    -- the user, never the pool (27,618/27,618 in 2025-02), so the pool is the side of the
    -- VIRTUAL leg that is not the taxer, and anything that ever pays tax is a router or user.
    sol_prebond_tax AS (
        SELECT tx_id, max(from_owner) as taxer
        FROM tokens_solana.transfers
        WHERE token_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
        AND to_owner = '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
        -- block_date is the partition column; bound it as well as the timestamp
        AND block_date >= cast(from_unixtime({{startTimestamp}}) as date)
        AND block_date <= cast(from_unixtime({{endTimestamp}}) as date)
        AND block_time >= from_unixtime({{startTimestamp}})
        AND block_time <  from_unixtime({{endTimestamp}})
        GROUP BY 1
    ),
    sol_prebond_swaps AS (
        SELECT t.tx_id, t.amount_display as amt,
            CASE WHEN t.from_owner = x.taxer THEN t.to_owner ELSE t.from_owner END as pool
        FROM tokens_solana.transfers t
        JOIN sol_prebond_tax x ON x.tx_id = t.tx_id
        WHERE t.token_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
        -- block_date only (partition pruning); the tx set is already time-bounded
        AND t.block_date >= cast(from_unixtime({{startTimestamp}}) as date)
        AND t.block_date <= cast(from_unixtime({{endTimestamp}}) as date)
        AND t.to_owner   <> '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
        AND t.from_owner <> '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
        AND (t.from_owner = x.taxer OR t.to_owner = x.taxer)
    ),
    sol_prebond AS (
        SELECT COALESCE(SUM(amt), 0) as virtual_volume
        FROM (
            SELECT s.amt, row_number() over (partition by s.tx_id order by s.amt desc) as rn
            FROM sol_prebond_swaps s
            LEFT JOIN (SELECT DISTINCT taxer FROM sol_prebond_tax) tx ON tx.taxer = s.pool
            WHERE tx.taxer IS NULL
            -- graduation moves a pool's whole balance out in one transfer; not a sell
            AND s.pool <> '67zLsVD39roVXCtoqs9W1Fzh9Bnz6iCwmF7sY1GEvic6'
            AND s.amt > 0
        ) d
        WHERE rn = 1
    )

SELECT (SELECT virtual_volume FROM sol_prebond) + (SELECT virtual_volume FROM sol_bonding) as virtual_volume
