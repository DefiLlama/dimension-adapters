// source: https://dune.com/p2pme/latest

import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const query = `
  WITH all_orders AS (
    SELECT "order" AS order_data, evt_block_time FROM p2px_polygon.BrokerFactory_evt_OrderComplete
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    UNION ALL
    SELECT "order" AS order_data, evt_block_time FROM p2px_polygon.BrokerFactoryv2_evt_OrderComplete
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    UNION ALL
    SELECT "_order" AS order_data, evt_block_time FROM p2p_me_base.OrderProcessor_evt_OrderCompleted
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    UNION ALL
    SELECT "_order" AS order_data, evt_block_time FROM p2p_me_base.OrderFlowFacet_evt_OrderCompleted
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
  ),
  
  extracted_orders AS (
    SELECT
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
  
  revenue_by_currency AS (
    SELECT
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
    GROUP BY currency
  ),
  
  asset_revenue AS (
    SELECT
      currency,
      CASE
        WHEN average_sell_price = 0 THEN 0
        ELSE turnover_volume * ((average_buy_price - average_sell_price) / average_sell_price)
      END AS realized_revenue_asset
    FROM revenue_by_currency
  )
  
  SELECT
    SUM(realized_revenue_asset) AS revenue
  FROM asset_revenue
  `;

  const result: any[] = await queryDuneSql(options, query);
  const revenue = result[0]?.revenue || 0;  // in USD
  dailyFees.addUSDValue(revenue);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2023-07-01",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Revenue from the spread between buy and sell prices on the P2P ramping platform.",
    Revenue: "Protocol captures the spread between buyer and seller prices applied to matched volume.",
    ProtocolRevenue: "Protocol captures the spread between buyer and seller prices applied to matched volume.",
  },
};

export default adapter;