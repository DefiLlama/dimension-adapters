// source: https://dune.com/p2pme/latest

import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
  WITH polygon_orders AS (
    SELECT "order" AS order_data, evt_block_time, 'polygon' AS chain FROM p2px_polygon.BrokerFactory_evt_OrderComplete
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    UNION ALL
    SELECT "order" AS order_data, evt_block_time, 'polygon' AS chain FROM p2px_polygon.BrokerFactoryv2_evt_OrderComplete
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
  ),
  
  base_orders AS (
    SELECT "_order" AS order_data, evt_block_time, 'base' AS chain FROM p2p_me_base.OrderProcessor_evt_OrderCompleted
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    UNION ALL
    SELECT "_order" AS order_data, evt_block_time, 'base' AS chain FROM p2p_me_base.OrderFlowFacet_evt_OrderCompleted
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
  ),
  
  all_orders AS (
    SELECT * FROM polygon_orders
    UNION ALL
    SELECT * FROM base_orders
  ),
  
  extracted_orders AS (
    SELECT
      chain,
      CASE
        WHEN JSON_EXTRACT_SCALAR(order_data, '$.currency') = '0x4944520000000000000000000000000000000000000000000000000000000000' THEN 'IDR'
        WHEN JSON_EXTRACT_SCALAR(order_data, '$.currency') = '0x42524c0000000000000000000000000000000000000000000000000000000000' THEN 'BRL'
        ELSE 'INR'
      END AS currency,
      TRY_CAST(JSON_EXTRACT_SCALAR(order_data, '$.orderType') AS INTEGER) AS order_type,
      TRY_CAST(JSON_EXTRACT_SCALAR(order_data, '$.amount') AS DOUBLE) / 1000000 AS amount,
      COALESCE(
          TRY_CAST(JSON_EXTRACT_SCALAR(order_data, '$.inrAmount') AS DOUBLE),
          TRY_CAST(JSON_EXTRACT_SCALAR(order_data, '$.fiatAmount') AS DOUBLE)
      ) / 1000000 AS fiat_amount
    FROM all_orders
  ),
  
  revenue_by_chain_currency AS (
    SELECT
      chain,
      currency,
      LEAST(
        SUM(CASE WHEN order_type = 0 THEN amount ELSE 0 END),
        SUM(CASE WHEN order_type IN (1, 2) THEN amount ELSE 0 END)
      ) AS turnover_volume,
      (CASE WHEN SUM(CASE WHEN order_type = 0 THEN amount ELSE 0 END) = 0 THEN 0 
        ELSE SUM(CASE WHEN order_type = 0 THEN fiat_amount ELSE 0 END) / SUM(CASE WHEN order_type = 0 THEN amount ELSE 0 END) 
      END) AS average_buy_price,
      (CASE WHEN SUM(CASE WHEN order_type IN (1, 2) THEN amount ELSE 0 END) = 0 THEN 0 
        ELSE SUM(CASE WHEN order_type IN (1, 2) THEN fiat_amount ELSE 0 END) / SUM(CASE WHEN order_type IN (1, 2) THEN amount ELSE 0 END) 
      END) AS average_sell_price
    FROM extracted_orders
    GROUP BY chain, currency
  ),
  
  asset_revenue AS (
    SELECT
      chain,
      currency,
      CASE
        WHEN average_sell_price = 0 THEN 0
        ELSE turnover_volume * ((average_buy_price - average_sell_price) / average_sell_price)
      END AS realized_revenue_asset
    FROM revenue_by_chain_currency
  )
  
  SELECT
    chain,
    SUM(realized_revenue_asset) AS revenue
  FROM asset_revenue
  GROUP BY chain
  `);
};

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const results = options.preFetchedResults || [];
  const chainData = results.find(item => item.chain === options.chain);

  if (chainData) {
    const revenue = chainData.revenue || 0;
    dailyFees.addUSDValue(revenue);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.BASE]: { start: "2025-04-23" },
    [CHAIN.POLYGON]: { start: "2023-07-01" },
  },
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Revenue from the spread between buy and sell prices on the P2P ramping platform.",
    Revenue: "Protocol captures the spread between buyer and seller prices applied to matched volume.",
    ProtocolRevenue: "Protocol captures the spread between buyer and seller prices applied to matched volume.",
  },
};

export default adapter;