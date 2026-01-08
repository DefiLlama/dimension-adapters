/*
  Kyros - Liquid Restaking Protocol on Solana
  
  This query tracks:
  1. JitoSOL staking rewards (Kyros's proportional share based on vault holdings)
  2. TipRouter NCN rewards (restaking rewards)
  3. Withdrawal fees (protocol revenue)
  
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
  SELECT DISTINCT account_stakeAccount as stake_account
  FROM stake_program_solana.stake_call_delegatestake
  WHERE account_stakeAuthority = '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS'
  UNION ALL
  SELECT 'BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL' AS stake_account
),
-- Total JitoSOL staking rewards for the period
total_jitosol_staking_rewards AS (
  SELECT SUM(lamports) as total_rewards
  FROM jito_stake_accounts sa
  LEFT JOIN solana.rewards r ON r.recipient = sa.stake_account
  WHERE r.reward_type = 'Staking'
    AND r.block_time >= from_unixtime({{start}})
    AND r.block_time <= from_unixtime({{end}})
),
-- Kyros's JitoSOL balance in vaults (average over period for proportional calculation)
kyros_jitosol_balance AS (
  SELECT AVG(balance) as avg_balance
  FROM (
    SELECT SUM(post_balance) as balance
    FROM solana.account_activity
    WHERE address IN ('{{kysol_vault}}')
      AND token_mint_address = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
      AND block_time >= from_unixtime({{start}})
      AND block_time <= from_unixtime({{end}})
    GROUP BY block_time
  ) balances
),
-- Total JitoSOL supply (for proportional calculation)
jitosol_total_supply AS (
  SELECT 14000000 * 1e9 as total_supply -- Approximate JitoSOL supply ~14M
),
-- Calculate Kyros's proportional share of staking rewards
kyros_staking_rewards AS (
  SELECT
    'staking' as source,
    'So11111111111111111111111111111111111111112' as mint,
    COALESCE(
      (kb.avg_balance / ts.total_supply) * tr.total_rewards,
      0
    ) as amount,
    0 as usd_amount
  FROM total_jitosol_staking_rewards tr
  CROSS JOIN kyros_jitosol_balance kb
  CROSS JOIN jitosol_total_supply ts
),
-- TipRouter NCN rewards distributed to Kyros vaults
tip_router_rewards AS (
  SELECT
    token_mint_address as mint,
    SUM(amount) as amount,
    SUM(amount_usd) as usd_amount
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
-- Rewards from Jito Restaking program (other NCN distributions)
restaking_rewards AS (
  SELECT
    token_mint_address as mint,
    SUM(amount) as amount,
    SUM(amount_usd) as usd_amount
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
    token_mint_address as mint,
    SUM(amount) as amount,
    SUM(amount_usd) as usd_amount
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
-- Combine all fee sources
SELECT source, mint, amount, usd_amount FROM kyros_staking_rewards WHERE amount > 0
UNION ALL
SELECT 'tip_router' as source, mint, amount, usd_amount FROM tip_router_rewards WHERE amount > 0
UNION ALL
SELECT 'restaking' as source, mint, amount, usd_amount FROM restaking_rewards WHERE amount > 0
UNION ALL
SELECT 'protocol' as source, mint, amount, usd_amount FROM protocol_fees WHERE amount > 0

