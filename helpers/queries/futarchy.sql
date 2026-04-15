/*
  Futarchy Protocol Fees
  
  Combines fees from two sources:
  1. Meteora DAMM pools - ownership-weighted LP fees based on actual liquidity positions
  2. Futarchy AMM direct swaps (0.5% fee)
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

WITH pool_map AS (
  SELECT '7dVri3qjYD3uobSZL3Zth8vSCgU6r6R2nvFsh7uVfDte' AS pool,
         '2b3fM2n9iTPG1xJrPevtdQ7Ju5QHuRbBmmA84k3UF4TA' AS position,
         '6VsC8PuKkXm5xo54c2vbrAaSfQipkpGHqNuKTxXFySx6' AS owner -- Umbra / USDC
  UNION ALL SELECT '59WuweKV7DAg8aUgRhNytScQxioaFYNJdWnox5FxAXFq',
                    'GyPSZcXCEGxHrcX5Trs131G13HbwDYZfr2pPAijzAEcg',
                    '55H1Q1YrHJQ93uhG4jqrBBHx3a8H7TCM8kvf2UM2g5q3' -- Ranger / USDC
  UNION ALL SELECT '6F88Y6iukU9GuL8CMWnx6YT832vBymNPicJBikQWeYe4',
                    'oawFz9eK6eqiTKDuoShc14Tt7sjzgjBY9VGGwpjdNGb',
                    'BpXtB2ASf2Tft97ewTd8PayXCqFQ6Wqod33qrwwfK9Vz' -- Paystream / USDC
  UNION ALL SELECT 'BGg7WsK98rhqtTp2uSKMa2yETqgwShFAjyf1RmYqCF7n',
                    '5xhd93HfYtsjvDki7ZWs2NSukfKdXzWPVvD7tnQ4Xkb5',
                    'AQyyTwCKemeeMu8ZPZFxrXMbVwAYTSbBhi1w4PBrhvYE' -- Loyal / USDC
  UNION ALL SELECT '5gB4NPgFB3MHFHSeKN4sbaY6t9MB8ikCe9HyiKYid4Td',
                    '3n3bY2XBcuqXDZ5kXZLKUzFSoSKPJjjZtyDa11CwfDqC',
                    'DGgYoUcu1aDZt4GEL5NQiducwHRGbkMWsUzsXh2j622G' -- Avici / USDC
  UNION ALL SELECT '57SnL1dxJPgc6TH6DcbRn7Nn5jnYCdcrkpVTy9d5vRuP',
                    '6PW5FipH8374LuocEAfjLKUJ991hsyBR8UQ1CEYkJgAa',
                    'BNvDfXYG2FAyBDYD71Xr9GhKE18MbmhtjsLKsCuXho6z' -- ZKFG / USDC
  UNION ALL SELECT '2zsbECzM7roqnDcuv2TNGpfv5PAnuqGmMo5YPtqmUz5p',
                    'w1BDxR4FvN4KryBuJwcEuohYKHkyDzD1beNH3AhF6Wn',
                    '98SPcyUZ2rqM2dgjCqqSXS4gJrNTLSNUAAVCF38xYj9u' -- Solomon / USDC
),

target_pools AS (
  SELECT DISTINCT pool FROM pool_map
),

target_owners AS (
  SELECT DISTINCT owner FROM pool_map
),

-- METEORA OWNERSHIP TRACKING
initial_liquidity AS (
  SELECT
    e.evt_block_time AS time,
    m.pool,
    m.position,
    m.owner,
    CAST(e.liquidity AS DECIMAL(38,0)) AS liquidity_delta
  FROM meteora_solana.cp_amm_evt_evtinitializepool e
  JOIN pool_map m ON m.pool = e.pool
  WHERE e.evt_block_time < from_unixtime({{end}})
),

add_liquidity AS (
  SELECT
    call_block_time AS time,
    account_pool AS pool,
    account_position AS position,
    account_owner AS owner,
    COALESCE(
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.AddLiquidityParameters.liquidity_delta') AS DOUBLE),
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.AddLiquidityParameters2.liquidity_delta') AS DOUBLE),
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.liquidity_delta') AS DOUBLE),
      0
    ) AS liquidity_delta
  FROM meteora_solana.cp_amm_call_add_liquidity
  WHERE call_block_time < from_unixtime({{end}})
    AND account_pool IN (SELECT pool FROM target_pools)
),

remove_liquidity AS (
  SELECT
    call_block_time AS time,
    account_pool AS pool,
    account_position AS position,
    account_owner AS owner,
    -COALESCE(
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.RemoveLiquidityParameters.liquidity_delta') AS DOUBLE),
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.RemoveLiquidityParameters2.liquidity_delta') AS DOUBLE),
      TRY_CAST(JSON_EXTRACT_SCALAR(params, '$.liquidity_delta') AS DOUBLE),
      0
    ) AS liquidity_delta
  FROM meteora_solana.cp_amm_call_remove_liquidity
  WHERE call_block_time < from_unixtime({{end}})
    AND account_pool IN (SELECT pool FROM target_pools)
),

all_liquidity_changes AS (
  SELECT * FROM initial_liquidity
  UNION ALL SELECT * FROM add_liquidity
  UNION ALL SELECT * FROM remove_liquidity
),

position_liquidity AS (
  SELECT
    pool, position, owner,
    SUM(COALESCE(liquidity_delta, 0)) AS cumulative_liquidity
  FROM all_liquidity_changes
  GROUP BY 1, 2, 3
),

pool_total_liquidity AS (
  SELECT pool, SUM(cumulative_liquidity) AS total_pool_liquidity
  FROM position_liquidity
  WHERE cumulative_liquidity > 0
  GROUP BY 1
),

ownership_shares AS (
  SELECT
    p.pool,
    p.owner,
    CAST(p.cumulative_liquidity AS DOUBLE) / NULLIF(CAST(t.total_pool_liquidity AS DOUBLE), 0) AS ownership_share
  FROM position_liquidity p
  JOIN pool_total_liquidity t ON p.pool = t.pool
  WHERE p.cumulative_liquidity > 0
    AND p.owner IN (SELECT owner FROM target_owners)
),

-- METEORA SWAPS
swaps_union AS (
  SELECT
    pool,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS usdc_out_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_usdc_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_token_raw
  FROM meteora_solana.cp_amm_evt_evtswap
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)

  UNION ALL

  SELECT
    pool,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS usdc_out_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DOUBLE) END AS lp_fee_usdc_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DOUBLE) END AS lp_fee_token_raw
  FROM meteora_solana.cp_amm_evt_evtswap2
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)
),

pool_fees AS (
  SELECT
    pool,
    SUM(COALESCE(lp_fee_usdc_raw, 0)) / 1e6 AS lp_fee_usdc,
    SUM(COALESCE(lp_fee_token_raw, 0)) / 1e6 AS lp_fee_token,
    COALESCE(
      (SUM(COALESCE(token_in_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_out_raw, 0)) / 1e6, 0),
      (SUM(COALESCE(token_out_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_in_raw, 0)) / 1e6, 0)
    ) AS token_price_usdc
  FROM swaps_union
  GROUP BY 1
),

meteora_aggregated AS (
  SELECT
    SUM(
      (COALESCE(f.lp_fee_usdc, 0) + COALESCE(f.lp_fee_token * f.token_price_usdc, 0))
      * COALESCE(o.ownership_share, 0)
    ) AS total_fees_usd
  FROM pool_fees f
  LEFT JOIN ownership_shares o ON f.pool = o.pool
),

-- FUTARCHY AMM
futarchy_swaps AS (
    SELECT
        block_time,
        tx_id,
        CASE
            WHEN varbinary_length(data) = 406 THEN to_base58(varbinary_substring(data, 279, 32))
            WHEN varbinary_length(data) = 670 THEN to_base58(varbinary_substring(data, 543, 32))
        END AS token,
        CASE varbinary_substring(data, 105, 1)
            WHEN 0x00 THEN 'buy'
            WHEN 0x01 THEN 'sell'
        END AS swap_type,
        varbinary_to_bigint(varbinary_reverse(varbinary_substring(data, 106, 8))) / 1e6 AS input_amount,
        varbinary_to_bigint(varbinary_reverse(varbinary_substring(data, 114, 8))) / 1e6 AS output_amount
    FROM solana.instruction_calls
    WHERE 
        block_time >= from_unixtime({{start}})
        AND block_time <= from_unixtime({{end}})
        AND tx_success = true
        AND executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND inner_executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND account_arguments[1] = 'DGEympSS4qLvdr9r3uGHTfACdN8snShk4iGdJtZPxuBC'
        AND is_inner = true
        AND cardinality(account_arguments) = 1
        AND varbinary_starts_with(data, 0xe445a52e51cb9a1d)
        AND varbinary_length(data) IN (406, 670)
        AND any_match(log_messages, x -> strpos(x, 'SpotSwap') > 0)
),

futarchy_token_filtered AS (
    SELECT
        token,
        swap_type,
        input_amount,
        output_amount,
        CASE
            WHEN swap_type = 'buy' THEN input_amount / NULLIF(output_amount, 0)
            WHEN swap_type = 'sell' THEN output_amount / NULLIF(input_amount, 0)
        END AS price
    FROM futarchy_swaps
    WHERE 
        input_amount > 0
        AND output_amount > 0
        AND token IS NOT NULL
),

futarchy_aggregated AS (
    SELECT
        SUM(CASE WHEN swap_type = 'buy' THEN input_amount ELSE 0 END) AS buy_volume_usdc,
        SUM(CASE WHEN swap_type = 'sell' THEN input_amount ELSE 0 END) AS sell_volume_tokens,
        AVG(price) AS avg_price
    FROM futarchy_token_filtered
    WHERE price > 0
)

SELECT
  'meteora_damm' AS source,
  COALESCE(total_fees_usd, 0) AS total_fees_usd
FROM meteora_aggregated

UNION ALL

SELECT
  'futarchy_amm' AS source,
  COALESCE(buy_volume_usdc * 0.005, 0) + COALESCE(sell_volume_tokens * COALESCE(avg_price, 0) * 0.005, 0) AS total_fees_usd
FROM futarchy_aggregated
