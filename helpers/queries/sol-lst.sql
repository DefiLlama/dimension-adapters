WITH
    stake_accounts AS (
        SELECT
            DISTINCT account_stakeAccount as stake_account_raw
        FROM stake_program_solana.stake_call_delegatestake
        WHERE account_stakeAuthority = '{{stake_pool_withdraw_authority}}'
        UNION ALL
        SELECT
            '{{stake_pool_reserve_account}}' AS stake_account_raw
    ),
    staking_fees AS (
        SELECT
            'dailyFees' as metric_type,
            sum(lamports/1e9) as amount
        FROM
            stake_accounts sa
            LEFT JOIN solana.rewards r on r.recipient=sa.stake_account_raw
            AND r.reward_type='Staking'
            AND r.block_time>=from_unixtime({{start}})
            AND r.block_time<=from_unixtime({{end}})
    ),
    revenue_fees AS (
        SELECT
            'dailyRevenue' as metric_type,
            SUM(amount)/POW(10, 9) as amount
        FROM
            tokens_solana.transfers
        WHERE
            to_token_account='{{lst_fee_token_account}}'
            AND token_mint_address='{{lst_mint}}'
            AND block_time>=from_unixtime({{start}})
            AND block_time<=from_unixtime({{end}})
    )
SELECT
    metric_type,
    COALESCE(amount, 0) as amount
FROM
    staking_fees
UNION ALL
SELECT
    metric_type,
    COALESCE(amount, 0) as amount
FROM
    revenue_fees
