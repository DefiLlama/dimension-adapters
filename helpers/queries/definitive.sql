WITH params AS (
  SELECT
    {{collector}} AS collector,
    from_unixtime({{start}}) AS t0,
    from_unixtime({{end}}) AS t1,
    0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643 AS collector,  -- your wallet
    0x0000000000000000000000000000000000000000 as zero_address,
    0xe8f7c89C5eFa061e340f2d2F206EC78FD8f7e124 as uniswap_v3, -- uniswap v3 WBTC-cbBTC
    0xE0554a476A092703abdB3Ef35c80e0D76d32939F as uniswap_v3_usdc, -- uniswap v3 USDC
    0xeF1eC136931Ab5728B0783FD87D109c9D15D31F1 as across -- I think this is across protocol
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
  CROSS JOIN params p
  WHERE t.blockchain IN ('base','ethereum','polygon','arbitrum','avalanche_c','optimism','bnb')
    AND t."to" = p.collector         -- inbound only
    AND t."tx_to" <> p.collector     -- exclude self-sends
    AND t."tx_from" <> p.zero_address
    AND t."tx_from" <> p.uniswap_v3
    AND t."tx_from" <> p.uniswap_v3_usdc
    AND t."tx_from" <> p.across
    AND date_trunc('day', t.block_time) = date_trunc('day', p.t0)  -- same day only
    AND t.amount <= 3000             -- remove large transfers
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
