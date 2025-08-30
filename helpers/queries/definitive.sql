WITH params AS (
  SELECT
    {{collector}} AS collector,
    from_unixtime({{start}}) AS t0,
    from_unixtime({{end}}) AS t1
),

usdc_by_chain AS (
  SELECT * FROM (
    VALUES
      ('arbitrum',    0xaf88d065e77c8cC2239327C5EDb3A432268e5831),
      ('base',        0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913),
      ('ethereum',    0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48),
      ('polygon',     0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174),
      ('avalanche_c', 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E),
      ('optimism',    0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85), 
      ('bnb',         0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d)
  ) AS t(blockchain, contract_address)
),

filtered_transfers AS (
  SELECT
    t.block_time,
    t.blockchain,
    t.contract_address,
    t.amount,
    t.amount_usd,
    t."to",
    t."tx_to"
  FROM tokens.transfers t
  CROSS JOIN params p
  WHERE t.block_time >= p.t0
    AND t.block_time < p.t1
    AND t.blockchain IN ('base','ethereum','polygon','arbitrum','avalanche_c','optimism','bnb')
    AND t."to" = p.collector
    AND t."tx_to" <> p.collector
    AND t.amount <= 3000
),

xfers AS (
  SELECT
    t.block_time,
    t.blockchain,
    t.amount,
    t.amount_usd
  FROM filtered_transfers t
  JOIN usdc_by_chain u
    ON t.blockchain = u.blockchain
   AND t.contract_address = u.contract_address
)

SELECT
  blockchain,
  COUNT(*)        AS tx_count,
  SUM(amount_usd) AS total_amount_usdc,
  AVG(amount_usd) AS usd_per_tx,
  SUM(amount)     AS total_amount,
  AVG(amount)     AS avg_per_tx
FROM xfers
GROUP BY 1
ORDER BY blockchain;
