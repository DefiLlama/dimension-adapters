/*
  Meteora Pool Fees for Futarchy
  
  Tracks LP fees from Meteora DAMM pools where Futarchy DAOs own 100% of liquidity.
  Fee rate: 0.4% of swap volume, 100% goes to Futarchy protocol.
  
  Target Pools:
    - Umbra/USDC, Ranger/USDC, Paystream/USDC, Loyal/USDC, 
    - Avici/USDC, ZKFG/USDC, Solomon/USDC
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

WITH target_pools AS (
  SELECT '7dVri3qjYD3uobSZL3Zth8vSCgU6r6R2nvFsh7uVfDte' AS pool -- Umbra / USDC
  UNION ALL SELECT '59WuweKV7DAg8aUgRhNytScQxioaFYNJdWnox5FxAXFq' -- Ranger / USDC
  UNION ALL SELECT '6F88Y6iukU9GuL8CMWnx6YT832vBymNPicJBikQWeYe4' -- Paystream / USDC
  UNION ALL SELECT 'BGg7WsK98rhqtTp2uSKMa2yETqgwShFAjyf1RmYqCF7n' -- Loyal / USDC
  UNION ALL SELECT '5gB4NPgFB3MHFHSeKN4sbaY6t9MB8ikCe9HyiKYid4Td' -- Avici / USDC
  UNION ALL SELECT '57SnL1dxJPgc6TH6DcbRn7Nn5jnYCdcrkpVTy9d5vRuP' -- ZKFG / USDC
  UNION ALL SELECT '2zsbECzM7roqnDcuv2TNGpfv5PAnuqGmMo5YPtqmUz5p' -- Solomon / USDC
),

swaps_v1 AS (
  SELECT
    pool,
    trade_direction,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_usdc_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_token_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS usdc_out_raw
  FROM meteora_solana.cp_amm_evt_evtswap
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)
),

swaps_v2 AS (
  SELECT
    pool,
    trade_direction,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DOUBLE) END AS lp_fee_usdc_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DOUBLE) END AS lp_fee_token_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS usdc_out_raw
  FROM meteora_solana.cp_amm_evt_evtswap2
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)
),

all_swaps AS (
  SELECT * FROM swaps_v1
  UNION ALL
  SELECT * FROM swaps_v2
),

aggregated AS (
  SELECT
    SUM(COALESCE(lp_fee_usdc_raw, 0)) / 1e6 AS lp_fee_usdc,
    SUM(COALESCE(lp_fee_token_raw, 0)) / 1e6 AS lp_fee_token,
    -- Calculate token price from swap ratios
    COALESCE(
      (SUM(COALESCE(token_in_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_out_raw, 0)) / 1e6, 0),
      (SUM(COALESCE(token_out_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_in_raw, 0)) / 1e6, 0)
    ) AS token_price_usdc
  FROM all_swaps
)

SELECT
  'meteora' AS source,
  COALESCE(lp_fee_usdc, 0) AS lp_fee_usdc,
  COALESCE(lp_fee_token * COALESCE(token_price_usdc, 0), 0) AS lp_fee_token_usdc,
  COALESCE(lp_fee_usdc, 0) + COALESCE(lp_fee_token * COALESCE(token_price_usdc, 0), 0) AS total_fees_usd
FROM aggregated
