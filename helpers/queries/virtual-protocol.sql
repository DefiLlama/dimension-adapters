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
        AND block_time <= from_unixtime({{endTimestamp}})
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
        AND evt_block_time <= from_unixtime({{endTimestamp}})
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
                AND b.block_time <= from_unixtime({{endTimestamp}})
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
        AND evt_block_time <= from_unixtime({{endTimestamp}})
    ),
    
    -- Ethereum revenue (already split into 70% dev, 30% ecosystem)
    eth_rev AS (
        SELECT 
            COALESCE(SUM(value) / power(10, 18), 0) as amt
        FROM erc20_ethereum.evt_transfer
        WHERE "to" = 0xB754597FDf090B6C860cB1deB63585aA3f19C163
        AND contract_address = 0x44ff8620b8cA30902395A7bD3F2407e1A091BF73
        AND evt_block_time >= from_unixtime({{startTimestamp}})
        AND evt_block_time <= from_unixtime({{endTimestamp}})
    )
    
    -- -- Solana contracts for agent tokens
    -- sol_contracts AS (
    --     SELECT DISTINCT token_mint_address
    --     FROM (
    --         SELECT token_mint_address
    --         FROM tokens_solana.transfers
    --         WHERE tx_id IN (
    --             SELECT tx_id
    --             FROM tokens_solana.transfers
    --             WHERE to_owner = '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
    --             AND token_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
    --             AND block_time >= timestamp '2024-08-30'
    --             AND block_time <= from_unixtime({{endTimestamp}})
    --         )
    --         AND block_time >= timestamp '2024-08-30'
    --         AND block_time <= from_unixtime({{endTimestamp}})
    --         AND token_mint_address NOT IN ('3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y', 'So11111111111111111111111111111111111111112')
    --         AND token_mint_address LIKE '%virt%'
    --     ) agent_tokens    
    -- ),
    
    -- -- Solana trading volume for sentient revenue
    -- sol_volume AS (
    --     SELECT
    --         COALESCE(SUM(
    --             CASE
    --                 WHEN token_bought_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y' THEN token_bought_amount
    --                 ELSE token_sold_amount 
    --             END
    --         ), 0) as base_token_amount
    --     FROM dex_solana.trades
    --     WHERE (
    --         (
    --             token_bought_mint_address IN (SELECT token_mint_address FROM sol_contracts)
    --             AND token_sold_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
    --         )
    --         OR (
    --             token_sold_mint_address IN (SELECT token_mint_address FROM sol_contracts)
    --             AND token_bought_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
    --         )
    --     )
    --     AND block_time >= from_unixtime({{startTimestamp}})
    --     AND block_time <= from_unixtime({{endTimestamp}})
    -- ),
    
    -- -- Solana prototype fees (starts from 2024-08-30)
    -- sol_prototype_fees AS (
    --     SELECT 
    --         COALESCE(SUM(amount) / power(10, 9), 0) as amt
    --     FROM tokens_solana.transfers
    --     WHERE token_mint_address = '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y'
    --     AND block_time >= GREATEST(from_unixtime({{startTimestamp}}), TIMESTAMP '2024-08-30')
    --     AND block_time <= from_unixtime({{endTimestamp}})
    --     AND to_owner = '933jV351WDG23QTcHPqLFJxyYRrEPWRTR3qoPWi3jwEL'
    -- )

-- Final output following original query structure exactly
SELECT
    chain,
    virtual_fees,
    cbbtc_fees
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
        ) as cbbtc_fees
    FROM base_rev_cbbtc_out bco
    
    UNION ALL
    
    -- Ethereum revenues (from eth_rev - already includes 70% + 30% = 100%)
    SELECT 
        'ethereum' as chain,
        COALESCE(er.amt, 0) as virtual_fees,
        0 as cbbtc_fees
    FROM eth_rev er
    
    -- UNION ALL
    
    -- -- Solana revenues (from sol_trading_rev)
    -- -- Sol prototype fees
    -- -- Sol sentient (1% of trading volume)
    -- SELECT 
    --     'solana' as chain,
    --     ( COALESCE(spf.amt, 0) + COALESCE(sv.base_token_amount * 0.01, 0) ) as virtual_fees,
    --     0 as cbbtc_fees
    -- FROM sol_prototype_fees spf
    -- CROSS JOIN sol_volume sv
)