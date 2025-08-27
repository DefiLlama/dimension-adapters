WITH params AS (
  SELECT
    0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643 AS collector,  -- your wallet
    from_unixtime({{start}}) AT TIME ZONE 'America/New_York' AS t0  -- start date in EDT
),

usdc_by_chain AS (
  SELECT * FROM (
    VALUES
      ('arbitrum',    0xaf88d065e77c8cC2239327C5EDb3A432268e5831),
      ('base',        0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913),
      ('ethereum',    0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48),
      ('polygon',     0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174),
      ('avalanche_c', 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E)
  ) AS t(blockchain, contract_address)   -- 👈 name the columns here
),

xfers AS (
  SELECT
    t.block_time,
    t.blockchain,
    t.amount,
    t.amount_usd
  FROM tokens.transfers t
  JOIN usdc_by_chain u
    ON t.blockchain = u.blockchain
   AND t.contract_address = u.contract_address
  CROSS JOIN params p
  WHERE t.blockchain IN ('base','ethereum','polygon','arbitrum','avalanche_c')
    AND t."to" = p.collector         -- inbound only
    AND t."tx_to" <> p.collector     -- exclude self-sends
    AND date_trunc('day', t.block_time AT TIME ZONE 'America/New_York') = date_trunc('day', p.t0)  -- same day in EDT
    AND t.amount <= 3000             -- remove large transfers
)

SELECT
  date_trunc('day', block_time AT TIME ZONE 'America/New_York') AS day,
  blockchain,
  COUNT(*)        AS tx_count,
  SUM(amount_usd) AS total_amount_usdc,
  AVG(amount_usd) AS usd_per_tx,
  SUM(amount)     AS total_amount,
  AVG(amount)     AS avg_per_tx
FROM xfers
GROUP BY 1, 2
ORDER BY day DESC, blockchain;
