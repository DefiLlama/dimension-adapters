/*
  Kyros - Liquid Restaking Protocol on Solana
  
  This query tracks:
  1. Total JitoSOL staking rewards (for proportional share calculation in adapter)
  2. TipRouter NCN rewards (restaking rewards)
  3. Jito Restaking rewards
  4. Withdrawal fees (protocol revenue)
  
  Sources:
  - JitoSOL staking rewards: solana.rewards from Jito stake accounts
  - TipRouter NCN: RouterBmuRBkPUbgEDMtdvTZ75GBdSREZR5uGUxxxpb
  - Jito Restaking: RestkWeAVL8fRGgzhfeoqFhsqKRchg6aa1XrcH96z4Q
  
  Kyros Vaults:
  - kySOL Vault: CQpvXgoaaawDCLh8FwMZEwQqnPakRUZ5BnzhjnEBPJv
  - kyJTO Vault: ABsoYTwRPBJEf55G7N8hVw7tQnDKBA6GkZCKBVrjTTcf
  - kyKYROS Vault: 8WgP3NgtVWLFuSzCk7aBz7FLuqEpcJwRPhkNJ5PnBTsV
  
  Jito Stake Pool Parameters (for staking rewards calculation):
  - Withdraw Authority: 6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS
  - Reserve Account: BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL
*/

WITH 
-- Get Jito stake accounts for staking rewards
jito_stake_accounts AS (
    SELECT DISTINCT account_stakeAccount AS stake_account
    FROM stake_program_solana.stake_call_delegatestake
    WHERE account_stakeAuthority = '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS'
    UNION ALL
    SELECT 'BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL' AS stake_account
),

-- Total JitoSOL staking rewards
-- Returns total in SOL (divided by 1e9)
staking_rewards AS (
    SELECT
        SUM(lamports) / 1e9 AS total_rewards_sol
    FROM jito_stake_accounts sa
    LEFT JOIN solana.rewards r ON r.recipient = sa.stake_account
        AND r.reward_type = 'Staking'
        AND r.block_time >= from_unixtime({{start}})
        AND r.block_time <= from_unixtime({{end}})
),

-- TipRouter NCN rewards distributed to Kyros vaults
tip_router_rewards AS (
    SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount,
        SUM(amount_usd) AS usd_amount
    FROM tokens_solana.transfers
    WHERE to_owner IN (
        '{{kysol_vault}}',
        '{{kyjto_vault}}',
        '{{kykyros_vault}}'
    )
        AND outer_executing_account = '{{tip_router}}'
        AND block_time >= from_unixtime({{start}})
        AND block_time <= from_unixtime({{end}})
    GROUP BY token_mint_address
),

-- Rewards from Jito Restaking program
restaking_rewards AS (
    SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount,
        SUM(amount_usd) AS usd_amount
    FROM tokens_solana.transfers
    WHERE to_owner IN (
        '{{kysol_vault}}',
        '{{kyjto_vault}}',
        '{{kykyros_vault}}'
    )
        AND outer_executing_account = '{{jito_restaking}}'
        AND block_time >= from_unixtime({{start}})
        AND block_time <= from_unixtime({{end}})
    GROUP BY token_mint_address
),

-- Withdrawal fees received by Kyros main authority
protocol_fees AS (
    SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount,
        SUM(amount_usd) AS usd_amount
    FROM tokens_solana.transfers
    WHERE to_owner = '{{main_authority}}'
        AND from_owner NOT IN (
            '{{kysol_vault}}',
            '{{kyjto_vault}}',
            '{{kykyros_vault}}'
        )
        AND block_time >= from_unixtime({{start}})
        AND block_time <= from_unixtime({{end}})
    GROUP BY token_mint_address
)

-- Return total staking rewards (adapter applies proportional share)
SELECT 
    'staking' AS source,
    'So11111111111111111111111111111111111111112' AS mint,
    COALESCE(total_rewards_sol, 0) AS amount,
    NULL AS usd_amount
FROM staking_rewards

UNION ALL

SELECT 'tip_router' AS source, mint, amount, usd_amount 
FROM tip_router_rewards WHERE amount > 0

UNION ALL

SELECT 'restaking' AS source, mint, amount, usd_amount 
FROM restaking_rewards WHERE amount > 0

UNION ALL

SELECT 'protocol' AS source, mint, amount, usd_amount 
FROM protocol_fees WHERE amount > 0
