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
    revenue AS (
        SELECT block_date, jitoSOL_amt, usd_amt FROM jitostake_pool_fees
        UNION ALL
        SELECT block_date, jitoSOL_amt, usd_amt FROM interceptor_fees
        UNION ALL
        SELECT block_date, jitoSOL_amt, usd_amt FROM tip_router_fees
    )
SELECT
    COALESCE(SUM(jitoSOL_amt), 0) AS total_jitoSOL_amt,
    COALESCE(SUM(usd_amt), 0) AS total_usd_amt
FROM
    revenue;
