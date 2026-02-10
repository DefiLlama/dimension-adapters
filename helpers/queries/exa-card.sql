WITH all_traces AS (
    -- 1. SEPARATE DATA (Unchanged)
    SELECT 
        block_time, tx_hash, input, 'Optimism' as chain, 
        SUBSTRING(input FROM 1 FOR 4) as method_id,
        ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY trace_address ASC) as rn
    FROM optimism.traces
    WHERE block_time >= DATE '2024-08-29'
    AND SUBSTRING(input FROM 1 FOR 4) IN (0x8980d703, 0x4e055f89, 0x4f10ca98)
    AND success AND call_type = 'call'

    UNION ALL

    SELECT 
        block_time, tx_hash, input, 'Base' as chain, 
        SUBSTRING(input FROM 1 FOR 4) as method_id,
        ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY trace_address ASC) as rn
    FROM base.traces
    WHERE block_time >= DATE '2025-11-01'
    AND SUBSTRING(input FROM 1 FOR 4) IN (0x8980d703, 0x4e055f89, 0x4f10ca98)
    AND success AND call_type = 'call'
),

/* 2. SAFE DECODING OF POINTERS 
   We first cast to DOUBLE (which can hold huge numbers without crashing).
   Then we only cast to INTEGER if the value is small enough.
*/
raw_pointers AS (
    SELECT 
        *,
        -- Decode raw 32-bytes to a safe number format first
        CAST(bytearray_to_uint256(bytearray_substring(input, 37, 32)) AS DOUBLE) as raw_pointer_val
    FROM all_traces
    WHERE rn = 1
),

batch_setup AS (
    SELECT 
        tx_hash, block_time, chain, method_id, input,
        CASE WHEN method_id = 0x8980d703 THEN 'PAY NOW' ELSE 'PAY LATER' END as category,

        -- POINTER SANITY CHECK:
        -- If Pointer > 100,000 bytes, it's garbage. Default to 0.
        CASE 
            WHEN method_id in ( 0x8980d703, 0x4e055f89) THEN 5
            WHEN raw_pointer_val > 100000 THEN 5 -- Fallback to prevent crash
            ELSE 5 + CAST(raw_pointer_val AS INTEGER)
        END as length_pos
    FROM raw_pointers
),

/* 3. SAFE DECODING OF LENGTHS */
raw_lengths AS (
    SELECT 
        *,
        -- Read the length value at the calculated position
        CAST(bytearray_to_uint256(bytearray_substring(input, length_pos, 32)) AS DOUBLE) as raw_len_val
    FROM batch_setup
),

safe_lengths AS (
    SELECT 
        *,
        -- LENGTH SANITY CHECK:
        -- If Length > 5000 items, it's impossible. Default to 1 to avoid "SEQUENCE" overflow.
        CASE 
            WHEN method_id in (0x8980d703, 0x4e055f89) THEN 1
            WHEN raw_len_val > 5000 THEN 0 -- Ignore this row, it's reading garbage
            ELSE CAST(raw_len_val AS INTEGER)
        END as safe_array_len
    FROM raw_lengths
),

/* 4. EXPLODE AND EXTRACT */
exploded_payments AS (
    SELECT 
        tx_hash, block_time, chain, category, t.idx,
        
        CAST(bytearray_to_uint256(
            CASE 
                WHEN method_id = 0x8980d703 THEN bytearray_substring(input, 5, 32)
                WHEN method_id = 0x4e055f89 THEN bytearray_substring(input, 37, 32)
                ELSE bytearray_substring(input, length_pos + 32 + ((t.idx - 1) * 32), 32)
            END
        ) AS DOUBLE) / 1e6 as amount_usd
        
    FROM safe_lengths
    -- Safely generate sequence using the sanitized length
    CROSS JOIN UNNEST(SEQUENCE(1, CASE WHEN safe_array_len = 0 THEN 1 ELSE safe_array_len END)) AS t(idx)
    -- Filter out the dummy row if length was actually 0
    WHERE safe_array_len > 0
)

/* 5. AGGREGATE */
SELECT 
    chain,
    SUM(amount_usd) as total_volume
FROM exploded_payments
WHERE amount_usd < 1e20 -- Final sanity check on amounts
AND TIME_RANGE
GROUP BY 1