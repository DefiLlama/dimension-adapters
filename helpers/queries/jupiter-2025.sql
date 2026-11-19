-- Jupiter Aggregator, Limit and DCA fees in USD, one row per UTC day from 2025-02-17 to 2025-12-31 (2026 is read from
-- Jupiter's stats API). Saved on Dune and read by fees/jupiter.ts, fees/jupiter-limit.ts and fees/jupiter-dca.ts.
-- aggregator_usd: fees at swap time, the net amount each fee authority token account receives per transaction (a routed
--   hop nets to zero). Limit keeper fills (signer gasAx5.., from 2025-10-02) go to limit_usd; sweeps and conversions
--   signed by the revenue collector 7JQey.. are left out.
-- limit_usd: those keeper fills plus Limit v2 fees from the fee vault 27ZAS.. to 7JQey..; limit_v1_usd: Limit v1 fees
--   into H3vk..; dca_usd: DCA fees into CpoD...
-- Priced at Dune's daily price; tokens without one are left out, as Jupiter does.
WITH
    t AS (
        SELECT block_date, tx_id, tx_signer, token_mint_address AS mint, amount, from_owner, to_owner,
            from_token_account, to_token_account,
            to_owner IN (
                'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV', '2MFoS3MPtvyQ4Wh4M9pdfPjz6UhVoNbFbGJAskCPCj3h',
                'HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw', '3CgvbiM3op4vjrrjH2zcrQUwsqh5veNVRjFCB9N6sRoD',
                '6LXutJvKUw8Q5ue2gCgKHQdAN4suWW8awzFVC6XCguFx', 'CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps',
                'GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ', '9nnLbotNTcUhvbrsA6Mdkx45Sm82G35zo28AqUvjExn8',
                '3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76', 'DSN3j1ykL3obAVNv7ZX49VsFCPe4LqzxHnmtLiPwY6xg',
                '69yhtoJR4JYPPABZcSNkzuqbaFbwHsCkja1sP1Q2aVT5', '6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB',
                '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', '4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZkdu71',
                'GP8StUXNYSZjPikyRsvkTbvRV1GBxMErb59cpeCJnDf1', 'HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY',
                '6zQecXhjYTifDGYxbW7vRTQBrBYsi1Uac6BEJ4WzefWS', 'GgY8theL9n9hQPoz2keQM8y6z8T6G6BH9FPLjBtkF9Hd',
                'G4FUwFD1h4tb4R6jkZXuoyst7YNbYTcJH3MvCUguss6E', 'F2Xjd4ZJYz6SfszyUVGzLUzAHRRhfU2iJacCfW5GCJHM',
                '3cHRcBKWbJeL2qyjgQ8wdSYxmRYW1ZyC2nVqTakAj57G', '6Ugimjtgk7rk5SbZNzcYvZiM3P6ki4Uq3QGtTHWNn8co',
                '4QKRxAfawktf6szGUP456AqBvaKSnmuGy91QnqdBDSke', '9kiYqGSb1nbYMc5xxZQHhKvJR57LLAHVyDvSQ3FHjDPK'
            ) AS to_fa,
            from_owner IN (
                'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV', '2MFoS3MPtvyQ4Wh4M9pdfPjz6UhVoNbFbGJAskCPCj3h',
                'HU23r7UoZbqTUuh3vA7emAGztFtqwTeVips789vqxxBw', '3CgvbiM3op4vjrrjH2zcrQUwsqh5veNVRjFCB9N6sRoD',
                '6LXutJvKUw8Q5ue2gCgKHQdAN4suWW8awzFVC6XCguFx', 'CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps',
                'GGztQqQ6pCPaJQnNpXBgELr5cs3WwDakRbh1iEMzjgSJ', '9nnLbotNTcUhvbrsA6Mdkx45Sm82G35zo28AqUvjExn8',
                '3LoAYHuSd7Gh8d7RTFnhvYtiTiefdZ5ByamU42vkzd76', 'DSN3j1ykL3obAVNv7ZX49VsFCPe4LqzxHnmtLiPwY6xg',
                '69yhtoJR4JYPPABZcSNkzuqbaFbwHsCkja1sP1Q2aVT5', '6U91aKa8pmMxkJwBCfPTmUEfZi6dHe7DcFq2ALvB2tbB',
                '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', '4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZkdu71',
                'GP8StUXNYSZjPikyRsvkTbvRV1GBxMErb59cpeCJnDf1', 'HFqp6ErWHY6Uzhj8rFyjYuDya2mXUpYEk8VW75K9PSiY',
                '6zQecXhjYTifDGYxbW7vRTQBrBYsi1Uac6BEJ4WzefWS', 'GgY8theL9n9hQPoz2keQM8y6z8T6G6BH9FPLjBtkF9Hd',
                'G4FUwFD1h4tb4R6jkZXuoyst7YNbYTcJH3MvCUguss6E', 'F2Xjd4ZJYz6SfszyUVGzLUzAHRRhfU2iJacCfW5GCJHM',
                '3cHRcBKWbJeL2qyjgQ8wdSYxmRYW1ZyC2nVqTakAj57G', '6Ugimjtgk7rk5SbZNzcYvZiM3P6ki4Uq3QGtTHWNn8co',
                '4QKRxAfawktf6szGUP456AqBvaKSnmuGy91QnqdBDSke', '9kiYqGSb1nbYMc5xxZQHhKvJR57LLAHVyDvSQ3FHjDPK'
            ) AS from_fa
        FROM tokens_solana.transfers
        WHERE block_date >= DATE '2025-02-17' AND block_date < DATE '2026-01-01'
            AND token_version != 'native'
    ),
    f AS (
        SELECT * FROM t
        WHERE to_fa OR from_fa
            OR to_owner IN ('H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN', 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2')
            OR from_owner = '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
    ),
    legs AS (
        SELECT block_date, tx_id, tx_signer, mint, to_token_account AS account, CAST(amount AS DOUBLE) AS delta FROM f WHERE to_fa
        UNION ALL
        SELECT block_date, tx_id, tx_signer, mint, from_token_account, -CAST(amount AS DOUBLE) FROM f WHERE from_fa
    ),
    -- Temporary wSOL accounts are unwrapped (closed) in the same transaction, which is not a transfer, so wSOL counts
    -- only in accounts that also send.
    wsol AS (
        SELECT DISTINCT account FROM legs WHERE mint = 'So11111111111111111111111111111111111111112' AND delta < 0
    ),
    fees AS (
        SELECT block_date, mint, SUM(delta) AS amount,
            CASE tx_signer WHEN 'gasAx5Y917MYdmdnwiomwYDhmDKNGDJnN1MmEbxVdVw' THEN 'limit'
                WHEN '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP' THEN 'sweep' ELSE 'aggregator' END AS product
        FROM legs
        WHERE mint != 'So11111111111111111111111111111111111111112' OR account IN (SELECT account FROM wsol)
        GROUP BY block_date, tx_id, tx_signer, mint, account
        HAVING SUM(delta) > 0
        UNION ALL
        SELECT block_date, mint, CAST(amount AS DOUBLE),
            CASE to_owner WHEN 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2' THEN 'dca'
                WHEN 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN' THEN 'limit_v1' ELSE 'limit' END
        FROM f
        WHERE to_owner = 'CpoD6tWAsMDeyvVG2q2rD1JbDY6d4AujnvAn2NdrhZV2'
            OR (to_owner = 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN' AND from_owner != to_owner)
            OR (from_owner = '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc' AND to_owner = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP')
    ),
    per_mint AS (
        SELECT block_date, product, mint, SUM(amount) AS amount FROM fees WHERE product != 'sweep' GROUP BY 1, 2, 3
    ),
    usd AS (
        SELECT m.block_date, m.product, m.amount / POWER(10, p.decimals) * p.price AS usd
        FROM per_mint m
        JOIN prices.day p ON p.blockchain = 'solana'
            AND p.timestamp = CAST(m.block_date AS TIMESTAMP)
            AND p.contract_address_varchar = m.mint
    )
SELECT
    CAST(block_date AS VARCHAR) AS day,
    SUM(IF(product = 'aggregator', usd, 0)) AS aggregator_usd,
    SUM(IF(product = 'limit', usd, 0)) AS limit_usd,
    SUM(IF(product = 'limit_v1', usd, 0)) AS limit_v1_usd,
    SUM(IF(product = 'dca', usd, 0)) AS dca_usd
FROM usd
GROUP BY 1
ORDER BY 1
