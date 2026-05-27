import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const V2_BACKSTOP = "CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7";

type BlendBackstopV2Row = {
  asset: string;
  backstop_revenue_raw: string | number;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Sources:
  // - v2 backstop PoolBalance keys discover Blend v2 pools.
  // - Dune stellar.contract_data ResData(asset) snapshots expose backstop_credit.
  // Backstop earnings are measured as positive backstop_credit growth for each reserve.
  // User deposits are not counted here because PoolBalance is only used for pool discovery.
  const query = `
    WITH pools AS (
      SELECT
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS pool
      FROM stellar.contract_data cd
      WHERE cd.contract_id = '${V2_BACKSTOP}'
        AND json_extract_scalar(json_parse(cd.key_decoded), '$.vec[0].symbol') = 'PoolBalance'
      GROUP BY 1
    ),

    reserve_rows AS (
      SELECT DISTINCT
        cd.closed_at,
        cd.ledger_sequence,
        cd.contract_id AS pool,
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS asset,
        COALESCE(
          TRY_CAST(regexp_extract(cd.val_decoded, '"backstop_credit"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE),
          0
        ) AS backstop_credit
      FROM stellar.contract_data cd
      JOIN pools p
        ON cd.contract_id = p.pool
      WHERE cd.closed_at < DATE '${options.dateString}' + interval '1' day
        AND json_extract_scalar(json_parse(cd.key_decoded), '$.vec[0].symbol') = 'ResData'
    ),

    prior_rows AS (
      SELECT
        closed_at,
        ledger_sequence,
        pool,
        asset,
        backstop_credit
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY pool, asset
            ORDER BY closed_at DESC, ledger_sequence DESC
          ) AS rn
        FROM reserve_rows
        WHERE closed_at < DATE '${options.dateString}'
      )
      WHERE rn = 1
    ),

    parsed AS (
      SELECT
        closed_at,
        ledger_sequence,
        pool,
        asset,
        backstop_credit
      FROM reserve_rows
      WHERE closed_at >= DATE '${options.dateString}'

      UNION ALL

      SELECT
        closed_at,
        ledger_sequence,
        pool,
        asset,
        backstop_credit
      FROM prior_rows
    ),

    ordered AS (
      SELECT
        *,
        LAG(backstop_credit) OVER (
          PARTITION BY pool, asset
          ORDER BY closed_at, ledger_sequence
        ) AS prev_backstop_credit
      FROM parsed
      WHERE asset IS NOT NULL
    ),

    daily AS (
      SELECT
        DATE(closed_at) AS day,
        asset,
        GREATEST(
          backstop_credit - COALESCE(prev_backstop_credit, backstop_credit),
          0
        ) AS backstop_revenue_raw
      FROM ordered
    )

    SELECT
      asset,
      SUM(backstop_revenue_raw) AS backstop_revenue_raw
    FROM daily
    WHERE day = DATE '${options.dateString}'
    GROUP BY 1
    HAVING SUM(backstop_revenue_raw) > 0
  `;

  const rows: BlendBackstopV2Row[] = await queryDuneSql(options, query);

  rows.forEach(({ asset, backstop_revenue_raw }) => {
    const backstopRevenue = Number(backstop_revenue_raw);
    dailyFees.add(asset, backstopRevenue, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(asset, backstopRevenue, "Borrow Interest To Backstop");
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Interest paid by Blend v2 borrowers that goes to backstop depositors.",
  SupplySideRevenue: "Interest paid to backstop depositors for providing pool insurance.",
  Revenue: "The Blend protocol does not keep treasury revenue from backstop interest.",
  ProtocolRevenue: "The Blend protocol does not keep treasury revenue from backstop interest.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2025-04-14",
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Borrower interest credited to the v2 backstop, measured from reserve backstop_credit growth.",
    },
    SupplySideRevenue: {
      "Borrow Interest To Backstop": "Borrower interest paid to Blend v2 backstop depositors.",
    },
  },
};

export default adapter;
