-- JitoSOL Related Fees
WITH
    jitostake_pool_fees AS (
        -- Withdrawal Fees / Rewards Fee / Orphaned Acc Fees from query_4908703 logic
        SELECT
            block_date,
            amount / 1e9 AS jitoSOL_amt,
            amount_usd AS usd_amt
        FROM
            tokens_solana.transfers
        WHERE
            (outer_executing_account = 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy' OR outer_executing_account = 'SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu')
            AND to_token_account = 'feeeFLLsam6xZJFc6UQFrHqkvVt4jfmVvi2BRLkUZ4i'
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
            to_owner = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF'
            AND outer_executing_account = '5TAiuAh3YGDbwjEruC1ZpXTJWdNDS7Ur7VeqNNiHMmGV'
            AND token_mint_address = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
            AND block_date >= FROM_UNIXTIME({{start}})
            AND block_date < FROM_UNIXTIME({{end}})
    ),
    tip_router_fees AS (
        -- Tip Router Fees
        SELECT
            block_date,
            amount / 1e9 AS jitoSOL_amt,
            amount_usd AS usd_amt
        FROM
            tokens_solana.transfers
        WHERE
            to_owner = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF'
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
        LEFT JOIN solana.transactions t
            ON a.tx_id = t.id
            AND a.block_date = t.block_date
        LEFT JOIN prices.minute AS p_sol
            ON DATE_TRUNC('minute', a.block_time) = p_sol.timestamp
            AND p_sol.blockchain = 'solana'
            AND p_sol.contract_address = FROM_BASE58('So11111111111111111111111111111111111111112')
        WHERE a.block_date >= date('2025-08-01')
            AND a.block_date >= FROM_UNIXTIME({{start}})
            AND a.block_date < FROM_UNIXTIME({{end}})
            AND a.address = '5eosrve6LktMZgVNszYzebgmmC7BjLK8NoWyRQtcmGTF'
            AND any_match(account_keys, x -> x = 'T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt')
    )
SELECT
    (SELECT COALESCE(SUM(usd_amt), 0) FROM jitostake_pool_fees) AS jitostake_pool_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM interceptor_fees) AS interceptor_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM tip_router_fees) AS tip_router_fees,
    (SELECT COALESCE(SUM(usd_amt), 0) FROM bam_mev_tips) AS bam_mev_tips;
