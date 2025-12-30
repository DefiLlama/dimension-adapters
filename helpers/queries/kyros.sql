/*
  Kyros - Liquid Restaking Protocol on Solana
  
  This query tracks TipRouter NCN rewards and restaking rewards distributed to Kyros vaults.
  
  Sources:
  - TipRouter NCN: RouterBmuRBkPUbgEDMtdvTZ75GBdSREZR5uGUxxxpb
  - Jito Restaking: RestkWeAVL8fRGgzhfeoqFhsqKRchg6aa1XrcH96z4Q
  
  Kyros Vaults:
  - kySOL Vault: CQpvXgoaaawDCLh8FwMZEwQqnPakRUZ5BnzhjnEBPJv
  - kyJTO Vault: ABsoYTwRPBJEf55G7N8hVw7tQnDKBA6GkZCKBVrjTTcf
  - kyKYROS Vault: 8WgP3NgtVWLFuSzCk7aBz7FLuqEpcJwRPhkNJ5PnBTsV
  
  Note: Base JitoSOL staking rewards are tracked by jito-staked-sol adapter.
  This query only tracks restaking-specific rewards to avoid double counting.
*/

WITH tip_router_rewards AS (
  -- TipRouter NCN rewards distributed to Kyros vaults
  -- These are the 0.15% of MEV tips allocated to JitoSOL/JTO vault stakers
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
restaking_rewards AS (
  -- Rewards from Jito Restaking program (other NCN distributions)
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
protocol_fees AS (
  -- Fees received by Kyros main authority (management fees)
  -- Excludes internal transfers from Kyros vaults
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
SELECT
  'tip_router' as source,
  mint,
  amount,
  usd_amount
FROM tip_router_rewards
WHERE amount > 0
UNION ALL
SELECT
  'restaking' as source,
  mint,
  amount,
  usd_amount
FROM restaking_rewards
WHERE amount > 0
UNION ALL
SELECT
  'protocol' as source,
  mint,
  amount,
  usd_amount
FROM protocol_fees
WHERE amount > 0

