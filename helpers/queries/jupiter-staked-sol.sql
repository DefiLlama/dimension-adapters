-- jupSOL history, one row per UTC day from the pool's start (2024-06-09) to two days ago, amounts in SOL / jupSOL.
-- Saved on Dune and read by fees/jupiter-staked-sol with queryDuneResult; rerun it on Dune to extend the history.
-- Same sources as the adapter's daily query (sol-lst.sql plus the MEV, priority fee and Jupiter validator legs).
WITH
    days AS (
        SELECT d AS day
        FROM UNNEST(SEQUENCE(DATE '2024-06-09', CURRENT_DATE - INTERVAL '2' DAY, INTERVAL '1' DAY)) AS t(d)
    ),
    -- the pool's stake accounts, by its withdraw authority, plus the reserve
    stake_accounts AS (
        SELECT DISTINCT account_stakeAccount AS stake_account, account_voteAccount AS vote_account
        FROM stake_program_solana.stake_call_delegatestake
        WHERE account_stakeAuthority = 'EMjuABxELpYWYEwjkKmQKBNCwdaFAy4QYAs6W9bDQDNw'
        UNION ALL
        SELECT 'FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2', NULL
    ),
    rewards AS (
        SELECT
            r.block_date AS day,
            SUM(r.lamports) / 1e9 AS staking_sol,
            -- the pool's rewards on Jupiter's validator, for its commission
            SUM(CASE WHEN sa.vote_account = 'CatzoSMUkTRidT5DwBxAC2pEtnwMBTpkCepHkFgZDiqb' THEN r.lamports ELSE 0 END) / 1e9 AS jupiter_validator_sol
        FROM solana.rewards r
        JOIN (SELECT stake_account, MAX(vote_account) AS vote_account FROM stake_accounts GROUP BY 1) sa ON r.recipient = sa.stake_account
        WHERE r.reward_type = 'Staking'
            AND r.block_date >= DATE '2024-06-09'
        GROUP BY 1
    ),
    mev AS (
        SELECT CAST(c.call_block_time AS DATE) AS day, SUM(c.amount) / 1e9 AS mev_sol
        FROM jito_tip_distribution_solana.jito_tip_distribution_call_claim c
        WHERE c.account_claimant IN (SELECT stake_account FROM stake_accounts)
            AND c.call_block_date >= DATE '2024-06-09'
        GROUP BY 1
    ),
    priority AS (
        SELECT CAST(call_block_time AS DATE) AS day, SUM(lamports) / 1e9 AS priority_sol
        FROM system_program_solana.system_program_call_transfer
        WHERE account_from IN ('JUPiTERrZqgf1jUyR7dSkhMx4Kn2qJyekWsg3LT1h4b', 'JUPiTERkf97eKN222JwY7bkpWuJnwqKtT44fsbJfhkr')
            AND account_to = 'FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2'
            AND call_block_date >= DATE '2024-06-09'
        GROUP BY 1
    ),
    -- deposit and withdrawal fees: jupSOL transferred (not minted) into the fee account, which changed after 2025-10-15
    deposit_withdraw AS (
        SELECT block_date AS day, SUM(amount) / 1e9 AS deposit_withdraw_jupsol
        FROM tokens_solana.transfers
        WHERE block_date >= DATE '2024-06-09'
            AND token_mint_address = 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'
            AND action != 'mint'
            AND ((to_token_account = 'DG399HKiLgKxGG176QiojyTtiSeqAurK6FVXGfBPTzSD' AND block_date <= DATE '2025-10-15')
                OR (to_token_account = 'GbvFCpMqKX65gQ8KNeob9JUAL7vHCHFSg8YN5bnpPT8g' AND block_date > DATE '2025-10-15'))
        GROUP BY 1
    )
SELECT
    CAST(d.day AS VARCHAR) AS day,
    COALESCE(r.staking_sol, 0) AS staking_sol,
    COALESCE(r.jupiter_validator_sol, 0) AS jupiter_validator_sol,
    COALESCE(m.mev_sol, 0) AS mev_sol,
    COALESCE(p.priority_sol, 0) AS priority_sol,
    COALESCE(dw.deposit_withdraw_jupsol, 0) AS deposit_withdraw_jupsol
FROM days d
LEFT JOIN rewards r ON r.day = d.day
LEFT JOIN mev m ON m.day = d.day
LEFT JOIN priority p ON p.day = d.day
LEFT JOIN deposit_withdraw dw ON dw.day = d.day
ORDER BY 1
