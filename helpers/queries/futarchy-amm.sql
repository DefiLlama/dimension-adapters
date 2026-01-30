/*
  Futarchy AMM Fees
  
  Calculates 0.5% (0.005) fees on swaps via the Futarchy AMM.
  - Buy swaps: fee taken from USDC input
  - Sell swaps: fee taken from token input (converted to USDC)
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

WITH futswap AS (
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

token_filtered AS (
    SELECT
        token,
        swap_type,
        input_amount,
        output_amount,
        CASE
            WHEN swap_type = 'buy' THEN input_amount / NULLIF(output_amount, 0)
            WHEN swap_type = 'sell' THEN output_amount / NULLIF(input_amount, 0)
        END AS price
    FROM futswap
    WHERE 
        swap_type IN ('buy', 'sell')
        AND input_amount > 0
        AND output_amount > 0
        AND token IS NOT NULL
),

aggregated AS (
    SELECT
        -- Buy volume (USDC in)
        SUM(CASE WHEN swap_type = 'buy' THEN input_amount ELSE 0 END) AS buy_volume_usdc,
        -- Sell volume (tokens in, need price conversion)
        SUM(CASE WHEN swap_type = 'sell' THEN input_amount ELSE 0 END) AS sell_volume_tokens,
        -- Average price for token -> USDC conversion
        AVG(CASE WHEN swap_type = 'sell' AND price > 0 THEN price END) AS avg_sell_price
    FROM token_filtered
    WHERE price IS NOT NULL AND price > 0
)

SELECT
    'futarchy_amm' AS source,
    -- USDC fees from buys (0.5% of USDC input)
    COALESCE(buy_volume_usdc * 0.005, 0) AS usdc_fees,
    -- Token fees from sells converted to USDC (0.5% of token input * price)
    COALESCE(sell_volume_tokens * COALESCE(avg_sell_price, 0) * 0.005, 0) AS token_fees_usdc,
    -- Total fees in USD
    COALESCE(buy_volume_usdc * 0.005, 0) + COALESCE(sell_volume_tokens * COALESCE(avg_sell_price, 0) * 0.005, 0) AS total_fees_usd,
    -- Volume for reference
    COALESCE(buy_volume_usdc, 0) + COALESCE(sell_volume_tokens * COALESCE(avg_sell_price, 0), 0) AS total_volume_usd
FROM aggregated
