-- Jupiter Aggregator history, one row per UTC day from the first JUP into the Litterbox (2025-02-17) to two days ago.
-- Saved on Dune and read by fees/jupiter.ts with queryDuneResult; rerun it on Dune to extend the history.
-- fees_usd: platform fees swept from the fee authorities to the revenue collector 7JQey.. (same as the Allium query).
-- buyback_jup: raw JUP (6 decimals) received by the Litterbox 6tZT9.., outflows ignored.
SELECT
    CAST(block_date AS VARCHAR) AS day,
    SUM(CASE WHEN to_owner = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
        AND from_owner IN (
            'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV',
            '2MFoS3MPtvyQ4Wh4M9pdfPjz6UhVoNbFbGJAskCPCj3h',
            'HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw',
            '3CgvbiM3op4vjrrjH2zcrQUwsqh5veNVRjFCB9N6sRoD',
            '6LXutJvKUw8Q5ue2gCgKHQdAN4suWW8awzFVC6XCguFx',
            'CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps',
            'GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ',
            '9nnLbotNTcUhvbrsA6Mdkx45Sm82G35zo28AqUvjExn8',
            '3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76')
        THEN COALESCE(amount_usd, 0) ELSE 0 END) AS fees_usd,
    SUM(CASE WHEN to_owner = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'
        AND from_owner != '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'
        AND token_mint_address = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
        THEN amount ELSE 0 END) AS buyback_jup
FROM tokens_solana.transfers
WHERE block_date >= DATE '2025-02-17'
    -- two days back so the last cached day is fully indexed
    AND block_date < CURRENT_DATE - INTERVAL '1' DAY
    AND to_owner IN ('7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP', '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX')
GROUP BY 1
ORDER BY 1
