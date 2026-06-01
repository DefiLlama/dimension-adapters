-- Render Network — Burn-Mint Equilibrium fee tracking
--
-- Sums RENDER tokens burned per day on the Solana SPL mint. Under the
-- BME model (RNP-001), every render job is priced in USD and an
-- equivalent USD value of RENDER is burned (minus a 5% Network Operator
-- service fee paid to OTOY off-chain). The on-chain burn therefore
-- represents the 95% node-operator side of gross job spend.
--
-- mint: rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof (RENDER, 8 decimals)
-- start: 2023-11-02 (Solana SPL launch / RNDR→RENDER 1:1 swap go-live)

SELECT
    SUM(amount) / 1e8 AS render_burned
FROM tokens_solana.transfers
WHERE token_mint_address = 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof'
  AND action = 'burn'
  AND block_time >= from_unixtime({{start}})
  AND block_time <  from_unixtime({{end}})
