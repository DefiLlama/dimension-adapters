WITH
    -- Agent treasury addresses from factory contracts
    agent_treasury_add AS (
        SELECT DISTINCT
            varbinary_ltrim(varbinary_substring(data, 97, 32)) as treasury_add
        FROM base.logs
        WHERE contract_address IN (
            0x94Bf9622348Cf5598D9A491Fa809194Cf85A0D61,
            0x5706d5A36c2Cc90a6d46E851efCb3C6Ac0372EB2,
            0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533,
            0xeb8A7B0184373550DCAa79156812F5d33e998C1E
        )
        AND topic0 = 0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658
        AND block_time >= timestamp '2024-08-30'
        AND block_time < from_unixtime({{endTimestamp}})
    ),

    -- Base chain trading transactions
    trading_txns AS (
        SELECT
            evt_tx_hash,
            contract_address,
            CASE
                WHEN contract_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b THEN value / power(10, 18)
                WHEN contract_address = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf THEN value / power(10, 8)
                ELSE null
            END as amt,
            CASE
                WHEN "to" = 0x86CbAC9d9Ac726F729eEf6627Dc4817BcBB03A9c THEN 'legacy'
                -- Modified: Exclude cowswap address from prototype category
                WHEN "to" = 0x89c69df65d0F6a0Df92b2f5B0715E9663b711341 AND "from" != 0x9008d19f58aabd9ed0d60971565aa8510560ab41 THEN 'prototype'
                WHEN "to" = 0xb51C52d9E5E41937B0100840b6C3CBA6f7A57A0C THEN 'ecosystem'
                WHEN "to" IN (SELECT treasury_add FROM agent_treasury_add) THEN 'sentient'
                ELSE null
            END as category1
        FROM erc20_base.evt_transfer
        WHERE contract_address IN (0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b, 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf)
        AND (
            "to" IN (
                0x86CbAC9d9Ac726F729eEf6627Dc4817BcBB03A9c, -- virtual legacy
                0x89c69df65d0F6a0Df92b2f5B0715E9663b711341, -- cbbtc prototype (but exclude cowswap)
                0xb51C52d9E5E41937B0100840b6C3CBA6f7A57A0C  -- builder code (ecosystem)
            )
            OR "to" IN (SELECT treasury_add FROM agent_treasury_add)
        )
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time < from_unixtime({{endTimestamp}})
    ),

    -- Base revenue transactions with fun/app categorization (only legacy and prototype)
    base_rev_txns AS (
        SELECT
            contract_address,
            amt,
            CASE
                WHEN contract_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b AND category2 = 'fun' AND category1 = 'legacy' THEN 'base-virtual-fun'
                WHEN contract_address = 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b AND category2 = 'app' AND category1 = 'legacy' THEN 'base-virtual-app'
                WHEN contract_address = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf AND category1 = 'prototype' THEN 'base-cbbtc-prototype'
                -- ecosystem and sentient are NOT included here - they're replaced by base_rev_cbbtc_out
                ELSE null
            END as category_new
        FROM (
            SELECT
                a.contract_address,
                a.amt,
                a.category1,
                -- buy / sell methods are fun, the rest are app
                CASE
                    WHEN varbinary_substring(b.data, 1, 4) IN (0x4189a68e, 0x7deb6025) THEN 'fun'
                    ELSE 'app'
                END as category2
            FROM trading_txns a
            LEFT JOIN base.transactions b ON a.evt_tx_hash = b.hash
                AND b.block_time >= from_unixtime({{startTimestamp}})
                AND b.block_time < from_unixtime({{endTimestamp}})
        ) categorized
        WHERE category1 IN ('legacy', 'prototype')
    ),

    -- CBBTC outflows from tax manager (sentient agent revenue)
    base_rev_cbbtc_out AS (
        SELECT
            COALESCE(SUM(value) / power(10, 8), 0) as amt
        FROM erc20_base.evt_transfer
        WHERE "from" = 0x7E26173192D72fd6D75A759F888d61c2cdbB64B1
        AND contract_address = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time < from_unixtime({{endTimestamp}})
    ),

    -- Ethereum revenue (already split into 70% dev, 30% ecosystem)
    eth_rev AS (
        SELECT
            COALESCE(SUM(value) / power(10, 18), 0) as amt
        FROM erc20_ethereum.evt_transfer
        WHERE "to" = 0xB754597FDf090B6C860cB1deB63585aA3f19C163
        AND contract_address = 0x44ff8620b8cA30902395A7bD3F2407e1A091BF73
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time < from_unixtime({{endTimestamp}})
    ),

    -- Base: new 1% platform fee in USDC, measured at the tax manager (dev + ecosystem =
    -- 100%). The ecosystem wallet 0xb51C52 alone is only the ecosystem share; the tax
    -- manager 0x7E26 (same one used for the cbBTC arm above) collects the full fee.
    base_rev_usdc AS (
        SELECT COALESCE(SUM(value) / power(10, 6), 0) as amt
        FROM erc20_base.evt_transfer
        WHERE "to" = 0x7E26173192D72fd6D75A759F888d61c2cdbB64B1
        AND contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time < from_unixtime({{endTimestamp}})
    ),

    -- Robinhood: 1% platform fee in USDG (6 decimals), measured at the Robinhood tax
    -- manager 0x6d80 (dev + ecosystem = 100%; it splits ~70% dev / 30% ecosystem, the
    -- ecosystem share being the forward to 0xb51C52).
    robinhood_rev_usdg AS (
        SELECT COALESCE(SUM(value) / power(10, 6), 0) as amt
        FROM erc20_robinhood.evt_transfer
        WHERE "to" = 0x6d80b81d9fc56a7a839b1af9006eb49151961ce7
        AND contract_address = 0x5fc5360d0400a0fd4f2af552add042d716f1d168
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time <= from_unixtime({{endTimestamp}})
    ),

    -- Solana pre-DBC era: Virtual Protocol ran its own bonding program until 2026-08-21 and
    -- collected the tax as VIRTUAL into one wallet. Same shape as the tax-manager arms above.
    sol_prototype_fees AS (
        SELECT COALESCE(SUM(amount_display), 0) as amt
        FROM tokens_solana.transfers
        WHERE token_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
        AND to_owner = '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
        -- block_date is the partition column; bound it as well as the timestamp
        AND block_date >= cast(from_unixtime({{startTimestamp}}) as date)
        AND block_date <= cast(from_unixtime({{endTimestamp}}) as date)
        AND block_time >= from_unixtime({{startTimestamp}})
        AND block_time <  from_unixtime({{endTimestamp}})
    ),

    -- Solana from 2026-08-21: the tax is distributed by an operator wallet and settles in
    -- JupUSD -- the Solana analogue of USDC on Base and USDG on Robinhood, so this is measured
    -- the same realized, wallet-scoped way and likewise spans bonding AND post-graduation trading.
    -- Only the JupUSD leg is revenue; the wallet's VIRTUAL/USDC/USDT/wSOL flows are the swap and
    -- conversion plumbing it uses to settle, and would double count.
    -- Note this is why the DBC per-swap fee is NOT also counted: the bonding fee is claimed, sold
    -- and paid out through this same wallet, so accruing it at the swap would count it twice. The
    -- launch anti-sniper surcharge never reaches here -- it is swept to a custody wallet and spent
    -- buying the agent token for its creator -- so this leg is already net of it.
    sol_graduated_fees AS (
        SELECT COALESCE(SUM(amount_display), 0) as amt
        FROM tokens_solana.transfers
        WHERE token_mint_address = 'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD'
        AND from_owner = 'Bo2jk8vNANP3cEgsEWCszvzy9mPR8CPqQKenUkNbyBHm'
        -- block_date is the partition column; bound it as well as the timestamp
        AND block_date >= cast(from_unixtime({{startTimestamp}}) as date)
        AND block_date <= cast(from_unixtime({{endTimestamp}}) as date)
        AND block_time >= from_unixtime({{startTimestamp}})
        AND block_time <  from_unixtime({{endTimestamp}})
    )

-- Final output following original query structure exactly
SELECT
    chain,
    virtual_fees,
    cbbtc_fees,
    usd_fees
FROM (
    -- Base chain revenues following original evm_combined structure
    SELECT
        'base' as chain,
        -- Virtual fun + app + cbbtc prototype (from base_rev_txns)
        -- CBBTC sentient revenue (from base_rev_combined - 70% dev + 30% ecosystem = 100%)
        (
            COALESCE((SELECT SUM(amt) FROM base_rev_txns WHERE category_new = 'base-virtual-fun'), 0) +
            COALESCE((SELECT SUM(amt) FROM base_rev_txns WHERE category_new = 'base-virtual-app'), 0)
        ) as virtual_fees,
        (
            COALESCE((SELECT SUM(amt) FROM base_rev_txns WHERE category_new = 'base-cbbtc-prototype'), 0) +
            COALESCE(bco.amt, 0)
        ) as cbbtc_fees,
        -- New 1% platform fee collected in USDC
        COALESCE(bru.amt, 0) as usd_fees
    FROM base_rev_cbbtc_out bco
    CROSS JOIN base_rev_usdc bru

    UNION ALL

    -- Ethereum revenues (from eth_rev - already includes 70% + 30% = 100%)
    SELECT
        'ethereum' as chain,
        COALESCE(er.amt, 0) as virtual_fees,
        0 as cbbtc_fees,
        0 as usd_fees
    FROM eth_rev er

    UNION ALL

    -- Robinhood revenues (new 1% platform fee collected in USDG)
    SELECT
        'robinhood' as chain,
        0 as virtual_fees,
        0 as cbbtc_fees,
        COALESCE(rru.amt, 0) as usd_fees
    FROM robinhood_rev_usdg rru

    UNION ALL

    -- Solana revenues: bonding-curve trading fee accrued to Virtual Protocol, in VIRTUAL
    SELECT
        'solana' as chain,
        COALESCE(spf.amt, 0) as virtual_fees,   -- pre-DBC bonding tax, in VIRTUAL, from 2025-02
        0 as cbbtc_fees,
        COALESCE(sgf.amt, 0) as usd_fees        -- JupUSD distribution, from 2026-08-21
    FROM sol_prototype_fees spf
    CROSS JOIN sol_graduated_fees sgf
) AS combined_revenues
