WITH
    stake_accounts AS (
        SELECT
            d.stake_account_raw,
            d.vote_account_raw,
            a.authority
        FROM
            dune.dune.result_solana_stake_accounts_vote_delegates AS d
            LEFT JOIN dune.dune.result_solana_stake_accounts_authorities AS a ON d.stake_account_raw=a.stake_account_raw
        WHERE
            d.latest=1
            AND a.latest=1
            AND a.authority='{{authority}}'
        UNION ALL
        SELECT
            '{{stake_account}}' AS stake_account_raw,
            NULL AS vote_account_raw,
            NULL AS authority
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
            to_token_account='{{LST_FEE_TOKEN_ACCOUNT}}'
            AND token_mint_address='{{LST_MINT}}'
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
