-- Jupiter Prediction history, one row per UTC day from the program's start (2025-10-21) to two days ago.
-- Saved on Dune and read by dexs/jupiter-prediction with queryDuneResult; rerun it on Dune to extend the history.
-- Same decoding as the adapter's daily query: fill_buy_order / fill_sell_order (b3 / fb) and their v2 versions
-- (850b5e1c096fe5d1 / 634609a43879ca22), contracts at offset 16 and fee at offset 24, in USD with 6 decimals.
-- arcade_fees: USDC swept to the Arcade treasury account (1% of winnings), from 2026-05-25.
WITH
    days AS (
        SELECT d AS day
        FROM UNNEST(SEQUENCE(DATE '2025-10-21', CURRENT_DATE - INTERVAL '2' DAY, INTERVAL '1' DAY)) AS t(d)
    ),
    fills AS (
        SELECT
            block_date AS day,
            BYTEARRAY_TO_BIGINT(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 1 + 24, 8))) / 1e6 AS fees,
            CASE
                WHEN BYTEARRAY_SUBSTRING(data, 1, 1) = FROM_HEX('b3') OR BYTEARRAY_SUBSTRING(data, 1, 8) = FROM_HEX('850b5e1c096fe5d1')
                THEN BYTEARRAY_TO_BIGINT(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 1 + 16, 8))) / 1e6
                    + BYTEARRAY_TO_BIGINT(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 1 + 24, 8))) / 1e6
                WHEN BYTEARRAY_SUBSTRING(data, 1, 1) = FROM_HEX('fb') OR BYTEARRAY_SUBSTRING(data, 1, 8) = FROM_HEX('634609a43879ca22')
                THEN BYTEARRAY_TO_BIGINT(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 1 + 16, 8))) / 1e6
            END AS volume
        FROM solana.instruction_calls
        WHERE block_date >= DATE '2025-10-21'
            AND executing_account = '3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp'
            AND (BYTEARRAY_SUBSTRING(data, 1, 1) IN (FROM_HEX('fb'), FROM_HEX('b3'))
                OR BYTEARRAY_SUBSTRING(data, 1, 8) IN (FROM_HEX('850b5e1c096fe5d1'), FROM_HEX('634609a43879ca22')))
            AND tx_success
            AND CARDINALITY(log_messages) > 10
    ),
    fills_by_day AS (
        SELECT day, SUM(volume) AS total_volume, SUM(fees) AS total_fees
        FROM fills
        GROUP BY 1
    ),
    arcade AS (
        SELECT block_date AS day, SUM(amount) / 1e6 AS arcade_fees
        FROM tokens_solana.transfers
        WHERE block_date >= DATE '2026-05-25'
            AND to_token_account = 'ABMPgzzP8dLrzLVc8PZb2MTLadQCmTTsxNVsQHKrJx6r'
            AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        GROUP BY 1
    )
SELECT CAST(d.day AS VARCHAR) AS day, f.total_volume, f.total_fees, COALESCE(a.arcade_fees, 0) AS arcade_fees
FROM days d
LEFT JOIN fills_by_day f ON f.day = d.day
LEFT JOIN arcade a ON a.day = d.day
ORDER BY 1
