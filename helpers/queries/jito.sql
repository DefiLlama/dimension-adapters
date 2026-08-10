-- JitoSOL Related Fees
WITH
    jitostake_pool_fees AS (
        -- Withdrawal Fees / Rewards Fee / Orphaned Acc Fees from query_4908703 logic
        -- 6wY8t... is the old manager fee account, replaced by feeeFLL... around 2023-12
        SELECT
            block_date,
            amount / 1e9 AS jitoSOL_amt,
            amount_usd AS usd_amt
        FROM
            tokens_solana.transfers
        WHERE
            (outer_executing_account = 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy' OR outer_executing_account = 'SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu')
            AND (to_token_account = 'feeeFLLsam6xZJFc6UQFrHqkvVt4jfmVvi2BRLkUZ4i' OR to_token_account = '8yoigZfzZ1nNaadumY9uPVD118225UYHTDpmjpr2nrSa' OR to_token_account = '6wY8tM91fQqX6aFgH3W9haPpuXqzHDVhV7HDS31xGwEt')
            -- exclude balance migrations between fee accounts (e.g. 5941.9 jitoSOL moved
            -- 6wY8t -> feeeFLL on 2023-12-07 when the manager fee account changed)
            AND (from_token_account IS NULL OR from_token_account NOT IN ('feeeFLLsam6xZJFc6UQFrHqkvVt4jfmVvi2BRLkUZ4i', '8yoigZfzZ1nNaadumY9uPVD118225UYHTDpmjpr2nrSa', '6wY8tM91fQqX6aFgH3W9haPpuXqzHDVhV7HDS31xGwEt'))
            AND block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
    ),
    interceptor_fees AS (
        -- Interceptor Fees from query_4908750 logic
        SELECT
            block_date,
            amount / 1e9 AS jitoSOL_amt,
            amount_usd AS usd_amt
        FROM
            tokens_solana.transfers
        WHERE
            (to_owner = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF' OR to_owner = 'GSyXx6WRm2o6Qu4RWxTH17swLZKpTKQdQTS2uGcus1NF')
            AND outer_executing_account = '5TAiuAh3YGDbwjEruC1ZpXTJWdNDS7Ur7VeqNNiHMmGV'
            AND token_mint_address = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
            AND block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
    ),
    tip_router_fees AS (
        -- Tip Router Fees from https://dune.com/queries/4908531
        SELECT
            block_date,
            amount / 1e9 AS jitoSOL_amt,
            amount_usd AS usd_amt
        FROM
            tokens_solana.transfers
        WHERE
            (to_owner = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF' OR to_owner = 'GSyXx6WRm2o6Qu4RWxTH17swLZKpTKQdQTS2uGcus1NF')
            AND outer_executing_account = 'RouterBmuRBkPUbgEDMtdvTZ75GBdSREZR5uGUxxxpb'
            AND token_mint_address = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
            AND block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
    ),
    bam_mev_tips AS (
        -- Mev Tips JIP24 (SOL) from query_5725652 logic
        SELECT
            a.block_date,
            a.balance_change / 1e9 AS jitoSOL_amt,
            p_sol.price * a.balance_change / 1e9 AS usd_amt
        FROM solana.account_activity a
        LEFT JOIN prices.minute AS p_sol
            ON DATE_TRUNC('minute', a.block_time) = p_sol.timestamp
            AND p_sol.blockchain = 'solana'
            AND p_sol.contract_address = FROM_BASE58('So11111111111111111111111111111111111111112')
            AND p_sol.timestamp >= FROM_UNIXTIME({{start}})
            AND p_sol.timestamp < FROM_UNIXTIME({{end}})
        LEFT JOIN solana.transactions t
            ON a.tx_id = t.id
            AND a.block_date = t.block_date
            AND t.block_date >= FROM_UNIXTIME({{start}})
            AND t.block_date < FROM_UNIXTIME({{end}})
        WHERE a.block_date >= date('2025-08-01')
            AND a.block_date >= FROM_UNIXTIME({{start}})
            AND a.block_date < FROM_UNIXTIME({{end}})
            AND (a.address = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF' OR a.address = 'GSyXx6WRm2o6Qu4RWxTH17swLZKpTKQdQTS2uGcus1NF')
            AND any_match(t.account_keys, x -> x = 'T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt')
    )
SELECT
    -- raw jitoSOL amount, priced in the adapter: dune amount_usd is null before 2024 so usd_amt
    -- cannot cover the old fee account history
    (SELECT COALESCE(SUM(jitoSOL_amt), 0) FROM jitostake_pool_fees) AS jitostake_pool_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM interceptor_fees) AS interceptor_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM tip_router_fees) AS tip_router_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM bam_mev_tips) AS bam_mev_tips
