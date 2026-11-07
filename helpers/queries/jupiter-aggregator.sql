-- Jupiter Aggregator history, one row per UTC day from the first JUP into the Litterbox (2025-02-17) to two days ago.
-- Saved on Dune and read by fees/jupiter.ts with queryDuneResult; rerun it on Dune to extend the history.
-- fees_usd: platform fees swept from the fee authorities (JUPITER_FEE_AUTHORITIES) to the revenue collector 7JQey.. (same as the Allium query).
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
            '3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76',
            'DSN3j1ykL3obAVNv7ZX49VsFCPe4LqzxHnmtLiPwY6xg',
            '69yhtoJR4JYPPABZcSNkzuqbaFbwHsCkja1sP1Q2aVT5',
            '6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB',
            '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE',
            '4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZkdu71',
            'GP8StUXNYSZjPikyRsvkTbvRV1GBxMErb59cpeCJnDf1',
            'HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY',
            '6zQecXhjYTifDGYxbW7vRTQBrBYsi1Uac6BEJ4WzefWS',
            'GgY8theL9n9hQPoz2keQM8y6z8T6G6BH9FPLjBtkF9Hd',
            'G4FUwFD1h4tb4R6jkZXuoyst7YNbYTcJH3MvCUguss6E',
            'F2Xjd4ZJYz6SfszyUVGzLUzAHRRhfU2iJacCfW5GCJHM',
            '3cHRcBKWbJeL2qyjgQ8wdSYxmRYW1ZyC2nVqTakAj57G',
            '6Ugimjtgk7rk5SbZNzcYvZiM3P6ki4Uq3QGtTHWNn8co',
            '4QKRxAfawktf6szGUP456AqBvaKSnmuGy91QnqdBDSke',
            '9kiYqGSb1nbYMc5xxZQHhKvJR57LLAHVyDvSQ3FHjDPK')
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
