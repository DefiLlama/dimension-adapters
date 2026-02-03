/*
  Futarchy Protocol Fees
  
  Combines fees from two sources:
  1. Meteora DAMM pools where Futarchy DAOs own 100% of liquidity (0.4% fee)
  2. Futarchy AMM direct swaps (0.5% fee)
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

-- METEORA POOLS
WITH meteora_pools AS (
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
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_usdc_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.lp_fee') AS DOUBLE) END AS lp_fee_token_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS token_in_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS token_out_raw,
    CASE WHEN trade_direction = 0 THEN CAST(JSON_EXTRACT_SCALAR(params, '$.SwapParameters.amount_in') AS DOUBLE) END AS usdc_in_raw,
    CASE WHEN trade_direction = 1 THEN CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.output_amount') AS DOUBLE) END AS usdc_out_raw
  FROM meteora_solana.cp_amm_evt_evtswap
  WHERE evt_block_time >= from_unixtime({{start}})
    AND evt_block_time < from_unixtime({{end}})
    AND pool IN (SELECT pool FROM meteora_pools)
),

meteora_swaps_v2 AS (
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
    AND pool IN (SELECT pool FROM meteora_pools)
),

meteora_all_swaps AS (
  SELECT * FROM meteora_swaps_v1
  UNION ALL
  SELECT * FROM meteora_swaps_v2
),

meteora_aggregated AS (
  SELECT
    SUM(COALESCE(lp_fee_usdc_raw, 0)) / 1e6 AS lp_fee_usdc,
    SUM(COALESCE(lp_fee_token_raw, 0)) / 1e6 AS lp_fee_token,
    COALESCE(
      (SUM(COALESCE(token_in_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_out_raw, 0)) / 1e6, 0),
      (SUM(COALESCE(token_out_raw, 0)) / 1e6) / NULLIF(SUM(COALESCE(usdc_in_raw, 0)) / 1e6, 0)
    ) AS token_price_usdc
  FROM meteora_all_swaps
),

-- FUTARCHY AMM
futarchy_swaps AS (
    SELECT
        block_time,
        tx_id,
        CASE
            WHEN LENGTH(data) = 406 THEN to_base58(SUBSTR(data, 279, 32))
            WHEN LENGTH(data) = 670 THEN to_base58(SUBSTR(data, 543, 32))
        END AS token,
        CASE
            WHEN to_hex(SUBSTR(data, 105, 1)) = '00' THEN 'buy'
            WHEN to_hex(SUBSTR(data, 105, 1)) = '01' THEN 'sell'
        END AS swap_type,
        from_big_endian_64(reverse(SUBSTR(data, 106, 8))) / 1e6 AS input_amount,
        from_big_endian_64(reverse(SUBSTR(data, 114, 8))) / 1e6 AS output_amount
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
        AND CAST(data AS VARCHAR) LIKE '0xe445a52e51cb9a1d%'
        AND LENGTH(data) >= 300
        AND array_join(log_messages, ' ') LIKE '%SpotSwap%'
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
        swap_type IN ('buy', 'sell')
        AND input_amount > 0
        AND output_amount > 0
        AND token IS NOT NULL
),

futarchy_aggregated AS (
    SELECT
        SUM(CASE WHEN swap_type = 'buy' THEN input_amount ELSE 0 END) AS buy_volume_usdc,
        SUM(CASE WHEN swap_type = 'sell' THEN input_amount ELSE 0 END) AS sell_volume_tokens,
        AVG(CASE WHEN swap_type = 'sell' AND price > 0 THEN price END) AS avg_sell_price
    FROM futarchy_token_filtered
    WHERE price IS NOT NULL AND price > 0
)

SELECT
  'meteora_damm' AS source,
  COALESCE(lp_fee_usdc, 0) + COALESCE(lp_fee_token * COALESCE(token_price_usdc, 0), 0) AS total_fees_usd
FROM meteora_aggregated

UNION ALL

SELECT
  'futarchy_amm' AS source,
  COALESCE(buy_volume_usdc * 0.005, 0) + COALESCE(sell_volume_tokens * COALESCE(avg_sell_price, 0) * 0.005, 0) AS total_fees_usd
FROM futarchy_aggregated
