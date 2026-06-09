import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const ORDER_FILLED = "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809::order_info::OrderFilled";
const POOL_CREATED = "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809::pool::PoolCreated<%";
const DEEP_USDC_POOL = "0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce";
const SUI_USDC_POOL = "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407";

const METRICS = {
  TRADING_FEES: "Maker & Taker Fees",
  TRADING_FEES_BURNED: "DEEP Tokens Burned",
  MAKER_REBATES: "Trading Rebates To Makers",
  REFERRAL_FEES: "Referral Fees To Referrers",
};

const stableQuoteFilter = (field: string) => `
  ${field} LIKE '%::usdc::%'
  OR ${field} LIKE '%::usdt::%'
  OR ${field} LIKE '%::ausd::%'
  OR ${field} LIKE '%::fdusd::%'
  OR ${field} LIKE '%::sui_usde::%'
  OR ${field} LIKE '%::usdsui::%'
  OR ${field} LIKE '%::iusd::%'
`;

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const stableQuote = stableQuoteFilter("quote_type");

  const query = `
    WITH order_fills AS (
      SELECT
        e.date,
        json_extract_scalar(e.event_json, '$.pool_id') AS pool_id,
        CAST(json_extract_scalar(e.event_json, '$.base_quantity') AS double) AS base_qty,
        CAST(json_extract_scalar(e.event_json, '$.quote_quantity') AS double) AS quote_qty,
        CAST(json_extract_scalar(e.event_json, '$.taker_fee') AS double) AS taker_fee,
        CAST(json_extract_scalar(e.event_json, '$.maker_fee') AS double) AS maker_fee,
        json_extract_scalar(e.event_json, '$.taker_is_bid') = 'true' AS taker_is_bid,
        json_extract_scalar(e.event_json, '$.taker_fee_is_deep') = 'true' AS taker_fee_is_deep,
        json_extract_scalar(e.event_json, '$.maker_fee_is_deep') = 'true' AS maker_fee_is_deep
      FROM sui.events e
      WHERE e.event_type = '${ORDER_FILLED}'
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) >= from_unixtime(${start})
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) < from_unixtime(${end})
        AND e.date BETWEEN CAST(from_unixtime(${start}) AS date) AND CAST(from_unixtime(${end}) AS date)
    ),

    pool AS (
      SELECT
        pool_id,
        CASE WHEN quote_type = '0x2::sui::sui' THEN 'SUI' WHEN ${stableQuote} THEN 'STABLE' ELSE 'UNKNOWN' END AS quote_kind,
        CASE WHEN quote_type = '0x2::sui::sui' THEN 9 ELSE 6 END AS qdec
      FROM (
        SELECT
          json_extract_scalar(event_json, '$.pool_id') AS pool_id,
          lower(max(regexp_extract(event_type, ', (.+?)>', 1))) AS quote_type
        FROM sui.events
        WHERE event_type LIKE '${POOL_CREATED}' AND date >= date '2024-10-01'
        GROUP BY 1
      ) t
    ),

    burns AS (
      SELECT
        e.date,
        SUM(CAST(json_extract_scalar(e.event_json, '$.deep_burned') AS double)) AS deep_burned
      FROM sui.events e
      WHERE e.event_type LIKE '%::pool::DeepBurned%'
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) >= from_unixtime(${start})
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) < from_unixtime(${end})
        AND e.date BETWEEN CAST(from_unixtime(${start}) AS date) AND CAST(from_unixtime(${end}) AS date)
      GROUP BY 1
    ),

    supply_events AS (
      SELECT
        e.date,
        json_extract_scalar(e.event_json, '$.pool_id') AS pool_id,
        'referral' AS kind,
        CAST(json_extract_scalar(e.event_json, '$.base_fee') AS double) AS base_fee,
        CAST(json_extract_scalar(e.event_json, '$.quote_fee') AS double) AS quote_fee,
        CAST(json_extract_scalar(e.event_json, '$.deep_fee') AS double) AS deep_fee
      FROM sui.events e
      WHERE e.event_type LIKE '%::pool::ReferralFeeEvent%'
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) >= from_unixtime(${start})
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) < from_unixtime(${end})
        AND e.date BETWEEN CAST(from_unixtime(${start}) AS date) AND CAST(from_unixtime(${end}) AS date)
      UNION ALL
      SELECT
        e.date,
        json_extract_scalar(e.event_json, '$.pool_id') AS pool_id,
        'rebate' AS kind,
        CAST(json_extract_scalar(e.event_json, '$.claim_amount.base') AS double) AS base_fee,
        CAST(json_extract_scalar(e.event_json, '$.claim_amount.quote') AS double) AS quote_fee,
        CAST(json_extract_scalar(e.event_json, '$.claim_amount.deep') AS double) AS deep_fee
      FROM sui.events e
      WHERE e.event_type LIKE '%::state::RebateEventV2%'
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) >= from_unixtime(${start})
        AND from_unixtime(CAST(e.timestamp_ms AS double) / 1000) < from_unixtime(${end})
        AND e.date BETWEEN CAST(from_unixtime(${start}) AS date) AND CAST(from_unixtime(${end}) AS date)
    ),

    prices AS (
      SELECT
        date,
        SUM(CASE WHEN pool_id = '${DEEP_USDC_POOL}' THEN quote_qty / 1e6 END)
          / NULLIF(SUM(CASE WHEN pool_id = '${DEEP_USDC_POOL}' THEN base_qty / 1e6 END), 0) AS deep_usd,
        SUM(CASE WHEN pool_id = '${SUI_USDC_POOL}' THEN quote_qty / 1e6 END)
          / NULLIF(SUM(CASE WHEN pool_id = '${SUI_USDC_POOL}' THEN base_qty / 1e9 END), 0) AS sui_usd
      FROM order_fills
      GROUP BY 1
    ),

    priced_pools AS (
      SELECT
        f.date,
        f.pool_id,
        p.quote_kind,
        p.qdec,
        pr.deep_usd,
        CASE WHEN p.quote_kind = 'SUI' THEN pr.sui_usd WHEN p.quote_kind = 'STABLE' THEN 1.0 END AS qusd,
        SUM(f.quote_qty) / NULLIF(SUM(f.base_qty), 0) AS quote_per_base_raw
      FROM order_fills f
      JOIN pool p ON f.pool_id = p.pool_id
      JOIN prices pr ON f.date = pr.date
      GROUP BY 1, 2, 3, 4, 5, 6
    ),

    trading_fees AS (
      SELECT
        f.date,
        SUM(
          CASE
            WHEN NOT f.taker_fee_is_deep OR pp.deep_usd IS NULL THEN 0
            ELSE f.taker_fee / 1e6 * pp.deep_usd
          END
          +
          CASE
            WHEN NOT f.maker_fee_is_deep OR pp.deep_usd IS NULL THEN 0
            ELSE f.maker_fee / 1e6 * pp.deep_usd
          END
          +
          CASE
            WHEN pp.qusd IS NULL THEN 0
            WHEN NOT f.taker_fee_is_deep AND f.taker_is_bid THEN f.taker_fee / POWER(10, pp.qdec) * pp.qusd
            WHEN NOT f.taker_fee_is_deep AND NOT f.taker_is_bid AND f.base_qty > 0
              THEN f.taker_fee * f.quote_qty / NULLIF(f.base_qty, 0) / POWER(10, pp.qdec) * pp.qusd
            ELSE 0
          END
          +
          CASE
            WHEN pp.qusd IS NULL THEN 0
            WHEN NOT f.maker_fee_is_deep AND NOT f.taker_is_bid THEN f.maker_fee / POWER(10, pp.qdec) * pp.qusd
            WHEN NOT f.maker_fee_is_deep AND f.taker_is_bid AND f.base_qty > 0
              THEN f.maker_fee * f.quote_qty / NULLIF(f.base_qty, 0) / POWER(10, pp.qdec) * pp.qusd
            ELSE 0
          END
        ) AS daily_fees_usd
      FROM order_fills f
      JOIN priced_pools pp ON f.date = pp.date AND f.pool_id = pp.pool_id
      GROUP BY 1
    ),

    supply_side AS (
      SELECT
        se.date,
        SUM(
          CASE WHEN se.kind = 'referral' THEN
            CASE WHEN pp.deep_usd IS NULL THEN 0 ELSE se.deep_fee / 1e6 * pp.deep_usd END
            + CASE WHEN pp.qusd IS NULL THEN 0 ELSE se.quote_fee / POWER(10, pp.qdec) * pp.qusd END
            + CASE WHEN pp.qusd IS NULL OR pp.quote_per_base_raw IS NULL THEN 0 ELSE se.base_fee * pp.quote_per_base_raw / POWER(10, pp.qdec) * pp.qusd END
          ELSE 0 END
        ) AS referral_fees_usd,
        SUM(
          CASE WHEN se.kind = 'rebate' THEN
            CASE WHEN pp.deep_usd IS NULL THEN 0 ELSE se.deep_fee / 1e6 * pp.deep_usd END
            + CASE WHEN pp.qusd IS NULL THEN 0 ELSE se.quote_fee / POWER(10, pp.qdec) * pp.qusd END
            + CASE WHEN pp.qusd IS NULL OR pp.quote_per_base_raw IS NULL THEN 0 ELSE se.base_fee * pp.quote_per_base_raw / POWER(10, pp.qdec) * pp.qusd END
          ELSE 0 END
        ) AS rebates_claimed_usd
      FROM supply_events se
      LEFT JOIN priced_pools pp ON se.date = pp.date AND se.pool_id = pp.pool_id
      GROUP BY 1
    ),

    active_dates AS (
      SELECT date FROM trading_fees
      UNION
      SELECT date FROM burns
      UNION
      SELECT date FROM supply_side
    )

    SELECT
      SUM(tf.daily_fees_usd) AS daily_fees_usd,
      SUM(COALESCE(b.deep_burned, 0)) AS deep_burned,
      SUM(COALESCE(ss.referral_fees_usd, 0)) AS referral_fees_usd,
      SUM(COALESCE(ss.rebates_claimed_usd, 0)) AS rebates_claimed_usd
    FROM active_dates d
    LEFT JOIN trading_fees tf ON d.date = tf.date
    LEFT JOIN burns b ON d.date = b.date
    LEFT JOIN supply_side ss ON d.date = ss.date
  `;

  const [row = {}]: any = await queryDuneSql(options, query, {
    extraUIDKey: "deepbookv3-sui-fees",
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(Number(row.daily_fees_usd ?? 0), METRICS.TRADING_FEES);
  dailyRevenue.add(ADDRESSES.sui.DEEP, Number(row.deep_burned ?? 0), METRICS.TRADING_FEES_BURNED);
  dailyHoldersRevenue.add(ADDRESSES.sui.DEEP, Number(row.deep_burned ?? 0), METRICS.TRADING_FEES_BURNED);
  dailySupplySideRevenue.addUSDValue(Number(row.referral_fees_usd ?? 0), METRICS.REFERRAL_FEES);
  dailySupplySideRevenue.addUSDValue(Number(row.rebates_claimed_usd ?? 0), METRICS.MAKER_REBATES);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All trading fees paid by users on DeepBook V3 trades.",
  Revenue: "DEEP tokens burned by DeepBook from accumulated trading fees. Burns can happen after the fees were collected, so daily revenue may not match same-day fees.",
  HoldersRevenue: "Same as revenue, because burned DEEP reduces token supply.",
  ProtocolRevenue: "No direct treasury revenue is counted.",
  SupplySideRevenue: "Fees paid out as maker rebates and referral rewards.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.TRADING_FEES]: "All taker and maker trading fees emitted in OrderFilled events.",
  },
  Revenue: {
    [METRICS.TRADING_FEES_BURNED]: "DEEP burned from accumulated trading fees, emitted by DeepBurned events.",
  },
  HoldersRevenue: {
    [METRICS.TRADING_FEES_BURNED]: "DEEP burned from accumulated trading fees.",
  },
  SupplySideRevenue: {
    [METRICS.REFERRAL_FEES]: "Trading fees allocated to DeepBook referrers.",
    [METRICS.MAKER_REBATES]: "Maker rebates claimed from accumulated DeepBook trading fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: "2024-10-14",
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;
