import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {

  // Bilateral OI: max(oi_long, oi_short) * 2.
  // Ostium is a bilateral OTC venue: every trade has a counterparty (another trader
  // or the Liquidity Pool Vault). The vault's private hedging operations are now
  // fully off-chain and can't be tracked directly, so trader-side notional alone
  // understates true exposure. Taking the larger side and doubling it gives an
  // approximation of total open exposure across both legs of the market. If/when
  // hedging activity is reflected on-chain again, this can be revisited.
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
        is_buy,
        sum(
          sum(IF(trade_id = order_id, notional, 0))
          - sum(IF(trade_id <> order_id, notional, 0))
        ) OVER (
          PARTITION BY is_buy
          ORDER BY date_trunc('day', executed_at)
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS open_interest
      FROM orders
      WHERE executed_at <= from_unixtime(${options.endTimestamp})
      GROUP BY 1, is_buy
    ),
    latest_oi_per_side AS (
      SELECT is_buy, open_interest
      FROM (
        SELECT
          is_buy,
          open_interest,
          row_number() OVER (PARTITION BY is_buy ORDER BY day DESC) AS rn
        FROM oi_daily
        WHERE day <= from_unixtime(${options.endTimestamp})
      )
      WHERE rn = 1
    ),
    final_oi AS (
      SELECT
        greatest(
          sum(IF(is_buy, open_interest, 0)),
          sum(IF(NOT is_buy, open_interest, 0))
        ) * 2 AS open_interest
      FROM latest_oi_per_side
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
