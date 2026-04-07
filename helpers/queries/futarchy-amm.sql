/*
  Futarchy AMM Fees
  
  Calculates 0.5% (0.005) fees on swaps via the Futarchy AMM.
  - Buy swaps: fee taken from USDC input
  - Sell swaps: fee taken from token input (output is USDC, so use output directly)
  
  Parameters:
    {{start}} - Unix timestamp for start of period
    {{end}} - Unix timestamp for end of period
*/

WITH futswap AS (
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
)

SELECT
    'futarchy_amm' AS source,
    -- Per-swap fee calculation avoids cross-token price averaging issues
    -- Buy: 0.5% of USDC input
    -- Sell: 0.5% of USDC output (output is already USDC-denominated)
    SUM(
        CASE
            WHEN swap_type = 'buy' THEN input_amount * 0.005
            WHEN swap_type = 'sell' THEN output_amount * 0.005
            ELSE 0
        END
    ) AS total_fees_usd,
    -- Volume for reference
    SUM(
        CASE
            WHEN swap_type = 'buy' THEN input_amount
            WHEN swap_type = 'sell' THEN output_amount
            ELSE 0
        END
    ) AS total_volume_usd
FROM futswap
WHERE swap_type IN ('buy', 'sell')
    AND input_amount > 0
    AND output_amount > 0
