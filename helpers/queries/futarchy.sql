/*
  Futarchy Protocol Fees
  
  Combines fees from two sources:
  1. Meteora DAMM pools - LP fees from pools where Futarchy DAOs own 100% of liquidity
  2. Futarchy AMM direct swaps (0.5% fee)
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

-- METEORA DAMM POOLS
WITH target_pools AS (
  SELECT '7dVri3qjYD3uobSZL3Zth8vSCgU6r6R2nvFsh7uVfDte' AS pool -- Umbra / USDC
  UNION ALL SELECT '59WuweKV7DAg8aUgRhNytScQxioaFYNJdWnox5FxAXFq' -- Ranger / USDC
  UNION ALL SELECT '6F88Y6iukU9GuL8CMWnx6YT832vBymNPicJBikQWeYe4' -- Paystream / USDC
  UNION ALL SELECT 'BGg7WsK98rhqtTp2uSKMa2yETqgwShFAjyf1RmYqCF7n' -- Loyal / USDC
  UNION ALL SELECT '5gB4NPgFB3MHFHSeKN4sbaY6t9MB8ikCe9HyiKYid4Td' -- Avici / USDC
  UNION ALL SELECT '57SnL1dxJPgc6TH6DcbRn7Nn5jnYCdcrkpVTy9d5vRuP' -- ZKFG / USDC
  UNION ALL SELECT '2zsbECzM7roqnDcuv2TNGpfv5PAnuqGmMo5YPtqmUz5p' -- Solomon / USDC
),

meteora_swaps_v1 AS (
  SELECT
    pool,
    trade_direction,
    CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) / 1e6 AS lp_fee_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS usdc_out_raw
  FROM meteora_solana.cp_amm_evt_evtswap
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)
),

meteora_swaps_v2 AS (
  SELECT
    pool,
    trade_direction,
    CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DOUBLE) / 1e6 AS lp_fee_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters2.amount_0') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DOUBLE) END AS usdc_out_raw
  FROM meteora_solana.cp_amm_evt_evtswap2
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM target_pools)
),

meteora_all_swaps AS (
  SELECT * FROM meteora_swaps_v1
  UNION ALL
  SELECT * FROM meteora_swaps_v2
),

meteora_fees_usd AS (
  SELECT
    CASE
      WHEN trade_direction = 0 THEN lp_fee_raw
      WHEN trade_direction = 1 AND token_in_raw > 0 AND usdc_out_raw > 0
        THEN lp_fee_raw * (usdc_out_raw / token_in_raw)
      ELSE 0
    END AS fee_usd
  FROM meteora_all_swaps
),

meteora_aggregated AS (
  SELECT SUM(fee_usd) AS total_fees_usd
  FROM meteora_fees_usd
),

-- FUTARCHY AMM
futswap AS (
    SELECT
        CASE
            WHEN to_hex(SUBSTR(data, 105, 1)) = '00' THEN 'buy'
            WHEN to_hex(SUBSTR(data, 105, 1)) = '01' THEN 'sell'
        END AS swap_type,
        from_big_endian_64(reverse(SUBSTR(data, 106, 8))) / 1e6 AS input_amount,
        from_big_endian_64(reverse(SUBSTR(data, 114, 8))) / 1e6 AS output_amount
    FROM solana.instruction_calls
    WHERE 
        block_time >= from_unixtime({{start}})
        AND block_time < from_unixtime({{end}})
        AND tx_success = true
        AND executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND inner_executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND account_arguments[1] = 'DGEympSS4qLvdr9r3uGHTfACdN8snShk4iGdJtZPxuBC'
        AND is_inner = true
        AND cardinality(account_arguments) = 1
        AND CAST(data AS VARCHAR) LIKE '0xe445a52e51cb9a1d%'
        AND LENGTH(data) >= 300
        AND array_join(log_messages, ' ') LIKE '%SpotSwap%'
),

futarchy_aggregated AS (
    SELECT
        SUM(
            CASE
                WHEN swap_type = 'buy' THEN input_amount * 0.005
                WHEN swap_type = 'sell' THEN output_amount * 0.005
                ELSE 0
            END
        ) AS total_fees_usd
    FROM futswap
    WHERE swap_type IN ('buy', 'sell')
        AND input_amount > 0
        AND output_amount > 0
)

-- Return both sources as separate rows
SELECT
  'meteora_damm' AS source,
  COALESCE(total_fees_usd, 0) AS total_fees_usd
FROM meteora_aggregated

UNION ALL

SELECT
  'futarchy_amm' AS source,
  COALESCE(total_fees_usd, 0) AS total_fees_usd
FROM futarchy_aggregated
