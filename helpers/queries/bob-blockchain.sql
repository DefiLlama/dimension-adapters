WITH daily_prices AS (
      SELECT
          price,
          timestamp day
      FROM prices.day
      WHERE blockchain = 'ethereum'
      AND contract_address = 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  ), realised_revenues AS (
      SELECT
          date_trunc('day', t.block_time) day,
          SUM(value) value
      FROM ethereum.traces t
      WHERE t.to = 0xC91482A96e9c2A104d9298D1980eCCf8C4dc764E
      AND t.value <> 0
      GROUP BY date_trunc('day', t.block_time)
  ), fee_vaults_balances_diff AS (
      SELECT
          address,
          LAG(block_number) OVER (
              PARTITION BY address 
              ORDER BY block_number
          ) AS from_block_number,
          block_number to_block_number,
          block_time to_block_time,
          balance_raw,
          CAST(balance_raw AS INT256) - LAG(CAST(balance_raw AS INT256)) OVER (
              PARTITION BY address 
              ORDER BY block_number
          ) AS balance_diff
      FROM dune.bob_collective.bob_balances
      ORDER BY address, block_number
  ), fee_vaults_withdrawals AS (
      SELECT
          value,
          block_number,
          contract_address
      FROM
        TABLE (
          decode_evm_event (
            abi => '{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"},{"indexed":false,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"address","name":"from","type":"address"}],"name":"Withdrawal","type":"event"}',
            input => TABLE (
              SELECT
                *
              FROM
                  bob.logs
              WHERE topic0 = 0xc8a211cc64b6ed1b50595a9fcb1932b6d1e5a6e8ef15b60e5b1f988ea9086bba -- Withdrawal
              AND contract_address IN (
                  0x420000000000000000000000000000000000001A,
                  0x4200000000000000000000000000000000000011,
                  -- NOTE: OperatorFeeVault withdrawls need to be ignored as the funds are sent to BaseFeeVault
                  -- 0x420000000000000000000000000000000000001b,
                  0x4200000000000000000000000000000000000019
              )
            )
          )
        )
  ), revenues AS (
      SELECT
          date_trunc('day', d.to_block_time) day,
          SUM(d.balance_diff) + COALESCE(SUM(w.value), 0) value
      FROM fee_vaults_balances_diff d
      LEFT JOIN fee_vaults_withdrawals w ON w.contract_address = d.address
      AND d.from_block_number < w.block_number
      AND w.block_number <= d.to_block_number
      WHERE from_block_number IS NOT NULL
      GROUP BY date_trunc('day', d.to_block_time)
  )
  SELECT
      p.day,
      -- SUM(COALESCE(rr.value, 0) * p.price / 1e18) dollar,
      SUM(COALESCE(rr.value, 0)) realised_revenue_value,
      SUM(COALESCE(rr.value, 0) / 1e18) realised_revenue_eth,
      SUM(COALESCE(rr.value, 0) * p.price / 1e18) realised_revenue_dollar,
      SUM(COALESCE(r.value, 0)) revenue_value,
      SUM(COALESCE(r.value, 0) / 1e18) revenue_eth,
      SUM(COALESCE(r.value, 0) * p.price / 1e18) revenue_dollar
  FROM daily_prices p
  LEFT JOIN realised_revenues rr ON rr.day = p.day
  LEFT JOIN revenues r ON r.day = p.day
  WHERE p.day >= DATE('2024-04-11')
  GROUP BY p.day