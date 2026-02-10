-- // https://dune.com/queries/6679245

WITH
anchor_logs AS (
    SELECT
        tx_hash
    FROM
        arbitrum.logs
    WHERE
        block_date >= date('2024-10-01')
        AND contract_address = FROM_HEX('22043fDdF353308B4F2e7dA2e5284E4D087449e1')
        AND topic0 = FROM_HEX('8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925')
        AND topic1 = 0x0000000000000000000000000302a72409b88da559693a3ca51978f136f46a08
)


, target_logs AS (
    SELECT
        tx_hash,
        TRY_CAST(FROM_BASE(SUBSTRING(TRY_CAST(topic3 AS VARCHAR), 5), 16) AS DECIMAL(38, 0)) AS nftID,
        varbinary_substring(topic2, 13, 20) AS wallet_address_mint
    FROM
        arbitrum.logs
    WHERE
        block_date >=  date('2024-10-01')
        AND contract_address = FROM_HEX('133CAEecA096cA54889db71956c7f75862Ead7A0')
        AND topic0 = FROM_HEX('ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef')
)


, raw_mint AS (
    SELECT
    a.tx_hash,
    t.nftID,
    t.wallet_address_mint
    FROM
        anchor_logs AS a
    INNER JOIN
        target_logs AS t ON a.tx_hash = t.tx_hash
)

, raw_spend AS (
  SELECT
    varbinary_substring(l.topic2, 13, 20) AS wallet_address_spend,
    l.tx_hash,
    TO_HEX(l.data) AS hex_data,
    DATE_ADD('hour', 8, t.block_time) AS spend_time,
    varbinary_substring(
      varbinary_substring(l.data, 65, 32),
      13, 20
    ) AS contract_address
  FROM arbitrum.logs l
  JOIN arbitrum.transactions t
    ON l.tx_hash = t.hash
  WHERE l.block_date >= date('2025-06-01')
    AND t.block_date >= date('2025-06-01')
    AND l.contract_address = FROM_HEX('e2e3B88B9893e18D0867c08f9cA93f8aB5935b14')
    AND l.topic0           = FROM_HEX('ccd892fadc4aff70d2a87e68be8c4ea12542363d8f405acbf0949c6816b99ccb')
)


, transactions_mint AS (
  SELECT
    wallet_address_mint,
    tx_hash
  FROM raw_mint
)

, spend_base AS (
  SELECT
    wallet_address_spend,
    tx_hash,
    hex_data,
    contract_address,
    spend_time,
    TRY_CAST(
        FROM_BASE(SUBSTRING(hex_data, 193, 64), 16)
          AS DECIMAL(38,0)
      ) / 100.0 AS spend_amount
  FROM raw_spend
)


, transactions_spend AS (
  SELECT
    sb.wallet_address_spend,
    sb.tx_hash,
    sb.spend_amount,

    CASE WHEN sb.contract_address = FROM_HEX('2c5d06f591d0d8cd43ac232c2b654475a142c7da') THEN sb.spend_amount * 1.1722 END AS spend_volume_eur,
    CASE WHEN sb.contract_address = FROM_HEX('be00f3db78688d9704bcb4e0a827aea3a9cc0d62') THEN sb.spend_amount END AS spend_volume_usd,
    CASE WHEN sb.contract_address = FROM_HEX('d41f1f0cf89fd239ca4c1f8e8ada46345c86b0a4') THEN sb.spend_amount * 1.25 END AS spend_volume_chf,
    CASE WHEN sb.contract_address = FROM_HEX('7288ac74d211735374a23707d1518dcbbc0144fd') THEN sb.spend_amount * 0.14 END AS spend_volume_cny,

    sb.spend_time

  FROM spend_base sb
)

, joinedInfo AS (
  SELECT
    d.wallet_address_spend,
    d.tx_hash,
    d.spend_amount,
    d.spend_time as block_time,
    d.spend_volume_eur,
    d.spend_volume_usd,
    d.spend_volume_chf,
    d.spend_volume_cny

  FROM transactions_spend d
  JOIN transactions_mint m
    ON d.wallet_address_spend = m.wallet_address_mint
)



  SELECT 
         SUM(spend_volume_usd)
         +
         SUM(spend_volume_eur)
         +
         SUM(spend_volume_chf)
         +
         SUM(spend_volume_cny) AS total_volume
  
  FROM joinedInfo

  WHERE TIME_RANGE
