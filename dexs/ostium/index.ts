import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const volumeRes = await queryDuneSql(options, `
    WITH orders AS (
      SELECT * FROM query_5255724
    ),
    daily_volume AS (
      SELECT
        sum(notional) as daily_volume
      FROM orders
      WHERE executed_at >= from_unixtime(${options.startTimestamp})
        AND executed_at < from_unixtime(${options.endTimestamp})
    ),
    oi_daily AS (
      SELECT
        date_trunc('day', executed_at) AS day,
        sum(
          sum(IF(trade_id = order_id, notional, 0))
          - sum(IF(trade_id <> order_id, notional, 0))
        ) OVER (
          ORDER BY date_trunc('day', executed_at)
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS open_interest
      FROM orders
      WHERE executed_at <= from_unixtime(${options.endTimestamp})
      GROUP BY 1
    ),
    final_oi AS (
      SELECT open_interest
      FROM oi_daily
      WHERE day <= from_unixtime(${options.endTimestamp})
      ORDER BY day DESC
      LIMIT 1
    )
    SELECT 
      coalesce(v.daily_volume, 0) as volume,
      coalesce(oi.open_interest, 0) as open_interest
    FROM daily_volume v
    CROSS JOIN final_oi oi
  `);

  const dailyVolume = volumeRes[0]?.volume || 0;
  const openInterestAtEnd = volumeRes[0]?.open_interest || 0;

  return {
    dailyVolume,
    openInterestAtEnd
  }
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  dependencies: [Dependencies.DUNE],
  start: '2025-04-16',
  isExpensiveAdapter: true
}

export default adapter;
