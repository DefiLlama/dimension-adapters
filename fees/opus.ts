import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

interface IData {
  day: string;
  daily_fees: number;
  daily_revenue: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const data: Array<IData> = await queryDuneSql(options, `
    WITH date_params AS (
    SELECT
      DATE '2025-12-01' AS start_date,
      CURRENT_DATE AS end_date
    ),
    cfg AS (
      (SELECT 0x066e3e2ea2095b2a0424b9a2272e4058f30332df5ff226518d19c20d3ab8e842 AS equalizer)
    ),
    -- Equalizer selectors
    allocator_events AS (SELECT 0x01453a8b2eb4888bfee5a5b17781ba95747a5f795cd81b44fe943773178f8d8e AS ee), -- Allocate
    allocate_raw AS (
      SELECT
        e.transaction_hash,
        e.block_time,
        DATE(e.block_time) AS day,
        e.data,
        TRY(VARBINARY_TO_UINT256(e.data[1])) AS n_recipients,
        TRY(VARBINARY_TO_UINT256(e.data[TRY_CAST((TRY(VARBINARY_TO_UINT256(e.data[1])) * 2) + 3 AS BIGINT)])) / 1e18 AS amount
      FROM starknet.events e
      WHERE e.from_address in (SELECT equalizer FROM cfg)
        AND e.keys[1] = (SELECT ee FROM allocator_events)
        AND DATE(e.block_time) >= (SELECT start_date FROM date_params)
    ),
    allocate_expanded AS (
      SELECT
        r.transaction_hash,
        r.block_time,
        r.day,
        r.n_recipients,
        idx + 1 AS idx,
        r.data[2 + idx] AS recipient,
        r.amount as total_amount,
        (TRY(VARBINARY_TO_UINT256(r.data[3 + TRY_CAST(r.n_recipients AS BIGINT) + idx])) / 1e27) * r.amount as recipient_amount
      FROM allocate_raw r
      CROSS JOIN UNNEST(SEQUENCE(0, TRY_CAST(r.n_recipients AS BIGINT) - 1)) AS t(idx)
    ),

    revenue_recipient1 AS (SELECT CAST(0x00ca40fca4208a0c2a38fc81a66c171623aac3b913a4365f7f0bc0eb3296573c AS VARBINARY) AS rr1),
    revenue_recipient2 AS (SELECT CAST(0x05f8f482c5855cb2ca4f183c1b1b6417e1b0e153cb84a21cc8489e0f58f0a30c AS VARBINARY) as rr2),

    daily_metrics AS (
      SELECT
        a.day,
        SUM(DISTINCT a.total_amount) AS daily_fees,
        SUM(CASE WHEN a.recipient IN ((SELECT rr1 FROM revenue_recipient1), (SELECT rr2 FROM revenue_recipient2)) THEN a.recipient_amount ELSE 0 END) AS daily_revenue
      FROM allocate_expanded a
      GROUP BY 1
    ),

    date_series AS (
      SELECT
        DATE_ADD('day', seq.day_offset, (SELECT start_date FROM date_params)) AS day
      FROM (
        SELECT sequence(0, DATE_DIFF('day', (SELECT start_date FROM date_params), (SELECT end_date FROM date_params)), 1) AS day_offset
      )
      CROSS JOIN UNNEST(day_offset) AS seq(day_offset)
    ),

    -- NEW: Left join the complete date series with the aggregated data to fill gaps
    final_metrics AS (
      SELECT
        ds.day,
        COALESCE(dm.daily_fees, 0) AS daily_fees,
        COALESCE(dm.daily_revenue, 0) AS daily_revenue
      FROM date_series ds
      LEFT JOIN daily_metrics dm ON ds.day = dm.day
    )

    SELECT
      day,
      daily_fees,
      daily_revenue
    FROM final_metrics
    ORDER BY day DESC;
  `);

  const feeItem = data.find(item => item.day.split(' ')[0] === new Date(options.startOfDay * 1000).toISOString().split('T')[0]);
  if (feeItem) {
    dailyFees.addUSDValue(feeItem.daily_fees);
    dailyRevenue.addUSDValue(feeItem.daily_revenue);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  UserFees: "All interest and minting fees",
  Fees: "All interest and minting fees",
  Revenue: "All interest and minting fees less protocol's proportion",
  ProtocolRevenue: "All interest and minting fees less protocol's proportion",
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  start: '2024-07-01',
  fetch,
  chains: [CHAIN.STARKNET],
  methodology,
}

export default adapter;
