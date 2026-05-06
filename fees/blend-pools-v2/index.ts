import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const V2_BACKSTOP = "CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7";

type BlendV2Row = {
  asset: string;
  borrow_interest_raw: string | number;
  backstop_revenue_raw: string | number;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH pools AS (
      SELECT
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS pool
      FROM stellar.contract_data cd
      WHERE cd.contract_id = '${V2_BACKSTOP}'
        AND json_extract_scalar(json_parse(cd.key_decoded), '$.vec[0].symbol') = 'PoolBalance'
      GROUP BY 1
    ),

    parsed AS (
      SELECT DISTINCT
        cd.closed_at,
        cd.ledger_sequence,
        cd.contract_id AS pool,
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS asset,
        TRY_CAST(regexp_extract(cd.val_decoded, '"d_rate"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE) AS d_rate,
        TRY_CAST(regexp_extract(cd.val_decoded, '"d_supply"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE) AS d_supply,
        COALESCE(
          TRY_CAST(regexp_extract(cd.val_decoded, '"backstop_credit"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE),
          0
        ) AS backstop_credit
      FROM stellar.contract_data cd
      JOIN pools p
        ON cd.contract_id = p.pool
      WHERE cd.closed_at < DATE '${options.dateString}' + interval '1' day
        AND cd.closed_at >= DATE '${options.dateString}' - interval '3' day
        AND json_extract_scalar(json_parse(cd.key_decoded), '$.vec[0].symbol') = 'ResData'
    ),

    ordered AS (
      SELECT
        *,
        LAG(d_rate) OVER (
          PARTITION BY pool, asset
          ORDER BY closed_at, ledger_sequence
        ) AS prev_d_rate,
        LAG(d_supply) OVER (
          PARTITION BY pool, asset
          ORDER BY closed_at, ledger_sequence
        ) AS prev_d_supply,
        LAG(backstop_credit) OVER (
          PARTITION BY pool, asset
          ORDER BY closed_at, ledger_sequence
        ) AS prev_backstop_credit
      FROM parsed
      WHERE asset IS NOT NULL
        AND d_rate IS NOT NULL
        AND d_supply IS NOT NULL
    ),

    daily AS (
      SELECT
        DATE(closed_at) AS day,
        asset,
        GREATEST(
          COALESCE(prev_d_supply, 0)
            * GREATEST(d_rate - COALESCE(prev_d_rate, d_rate), 0)
            / 1e12,
          0
        ) AS borrow_interest_raw,
        GREATEST(
          backstop_credit - COALESCE(prev_backstop_credit, backstop_credit),
          0
        ) AS backstop_revenue_raw
      FROM ordered
    )

    SELECT
      asset,
      SUM(borrow_interest_raw) AS borrow_interest_raw,
      SUM(
        CASE
          WHEN backstop_revenue_raw <= borrow_interest_raw THEN backstop_revenue_raw
          ELSE 0
        END
      ) AS backstop_revenue_raw
    FROM daily
    WHERE day = DATE '${options.dateString}'
    GROUP BY 1
    HAVING SUM(borrow_interest_raw) > 0
  `;

  const rows: BlendV2Row[] = await queryDuneSql(options, query);

  rows.forEach(({ asset, borrow_interest_raw, backstop_revenue_raw }) => {
    const borrowInterest = Number(borrow_interest_raw);
    const backstopRevenue = Number(backstop_revenue_raw);
    const lenderRevenue = Math.max(borrowInterest - backstopRevenue, 0);

    dailyFees.add(asset, lenderRevenue, METRIC.BORROW_INTEREST);
    if (lenderRevenue > 0) dailySupplySideRevenue.add(asset, lenderRevenue, "Borrow Interest To Lenders");
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Interest paid by Blend v2 borrowers that goes to lenders.",
  SupplySideRevenue: "Lender component of Blend v2 borrow interest paid to pool suppliers after the backstop share.",
  Revenue: "Blend v2 does not retain protocol revenue from pool borrow interest.",
  ProtocolRevenue: "Blend v2 does not retain treasury revenue from pool borrow interest.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-04-14",
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest paid by borrowers to lenders. It is calculated from debt rate growth, then excludes the portion credited to the backstop.",
    },
    SupplySideRevenue: {
     "Borrow Interest To Lenders": "Borrower interest paid to users who supplied assets to Blend v2 pools.",
    },
  },
};

export default adapter;
