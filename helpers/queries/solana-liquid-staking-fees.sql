WITH stake_accounts AS (
    SELECT
        d.stake_account_raw,
        d.vote_account_raw,
        a.authority
    FROM dune.dune.result_solana_stake_accounts_vote_delegates AS d
    LEFT JOIN dune.dune.result_solana_stake_accounts_authorities AS a
        ON d.stake_account_raw = a.stake_account_raw
    WHERE
        d.latest = 1
        AND a.latest = 1
        AND a.authority = '{{authority}}'
    UNION ALL
    SELECT
        '{{stake_account}}' AS stake_account_raw,
        NULL AS vote_account_raw,
        NULL AS authority
    )
    SELECT
      sum(lamports/1e9) as daily_yield
    FROM stake_accounts sa
    LEFT JOIN solana.rewards r
      on r.recipient = sa.stake_account_raw
    AND r.reward_type = 'Staking'
    AND r.block_time >= from_unixtime({{start}})
    AND r.block_time < from_unixtime({{end}})