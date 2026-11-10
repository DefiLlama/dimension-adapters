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
    -- Jito MEV tips claimed by the pool's stake accounts. Like inflation rewards they raise SOL per LST, and the stake
    -- pool's epoch fee is charged on them. A separate row, so an adapter can leave it out (jito-staked-sol does).
    -- Dune's decoded Solana tables (this one and stake_call_delegatestake) hold instructions of successful transactions
    -- only and have no tx_success column, so failed claims and delegations never reach these sums.
    mev_rewards AS (
        SELECT
            'dailyMevRewards' as metric_type,
            sum(c.amount/1e9) as amount
        FROM
            stake_accounts sa
            JOIN jito_tip_distribution_solana.jito_tip_distribution_call_claim c on c.account_claimant=sa.stake_account_raw
            AND c.call_block_time>=from_unixtime({{start}})
            AND c.call_block_time<from_unixtime({{end}})
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
            {{exclude_mints_filter}}
    ),
    --   action='transfer' -> deposit/withdrawal fees paid by users on their principal,
    --                        which are NOT part of the staking rewards
    user_paid_fees AS (
        SELECT
            'dailyUserFees' as metric_type,
            SUM(amount)/POW(10, 9) as amount
        FROM
            tokens_solana.transfers
        WHERE
            to_token_account='{{lst_fee_token_account}}'
            AND token_mint_address='{{lst_mint}}'
            AND action='transfer'
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
    mev_rewards
UNION ALL
SELECT
    metric_type,
    COALESCE(amount, 0) as amount
FROM
    revenue_fees
UNION ALL
SELECT
    metric_type,
    COALESCE(amount, 0) as amount
FROM
    user_paid_fees
