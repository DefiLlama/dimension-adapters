WITH
  dex_trades_aggregated AS (
    SELECT
      tx_hash,
      MAX(amount_usd) AS amount_usd
    FROM
      dex.trades
    WHERE
      block_time>=from_unixtime({{startTimestamp}})
      AND block_time<=from_unixtime({{endTimestamp}})
    GROUP BY
      tx_hash
  ),
  all_traces AS (
    SELECT
      'polygon' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      polygon.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
    UNION ALL
    SELECT
      'ethereum' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      ethereum.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
    UNION ALL
    SELECT
      'arbitrum' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      arbitrum.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
    UNION ALL
    SELECT
      'bnb' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      bnb.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
    UNION ALL
    SELECT
      'optimism' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      optimism.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
    UNION ALL
    SELECT
      'base' AS blockchain,
      td.block_time,
      td.tx_hash
    FROM
      base.traces_decoded td
    WHERE
      td.namespace IN ('conveyorlabs')
      AND td.contract_name IN ('ConveyorRouter')
      AND td.function_name IN (
        'swapExactEthForToken',
        'swapExactTokenForToken',
        'swapExactTokenForEth'
      )
      AND td.block_time>=from_unixtime({{startTimestamp}})
      AND td.block_time<=from_unixtime({{endTimestamp}})
  ),
  conveyor_transactions_with_volume AS (
    SELECT
      t.blockchain AS chain,
      t.block_time,
      d.amount_usd
    FROM
      all_traces t
      LEFT JOIN dex_trades_aggregated d ON t.tx_hash=d.tx_hash
    WHERE
      d.amount_usd IS NOT NULL
  ),
  volume_totals_by_chain AS (
    SELECT
      split_part(upper(ctwv.chain), '_', 1) AS blockchain,
      SUM(ctwv.amount_usd) AS volume_24h
    FROM
      conveyor_transactions_with_volume ctwv
    GROUP BY
      1
  )
SELECT
  blockchain,
  COALESCE(volume_24h, 0) AS volume_24h
FROM
  volume_totals_by_chain
ORDER BY
  volume_24h DESC;
