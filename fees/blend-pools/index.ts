import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const V1_POOLS = [
  "CDVQVKOY2YSXS2IC7KN6MNASSHPAO7UN2UR2ON4OI2SKMFJNVAMDX6DP",
  "CAQF5KNOFIGRI24NQRRGUPD46Q45MGMXZMRTQFXS25Y4NZVNPT34GM6S",
  "CBP7NO6F7FRDHSOFQBT2L2UWYIZ2PU76JKVRYAQTG3KZSQLYAOKIF2WB",
  "CDE65QK2ROZ32V2LVLBOKYPX47TYMYO37Z6ASQTBRTBNK53C7C6QF4Y7",
];

type BlendV1Row = {
  asset: string;
  borrow_interest_raw: string | number;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Source: Dune stellar.contract_data snapshots of Blend pool ResData(asset).
  // Blend debt rates are scaled by 1e12, so borrower interest per update is:
  // previous d_supply * max(current d_rate - previous d_rate, 0) / 1e12.
  // A 3-day lookback gives LAG() a prior reserve state before the target day.
  const query = `
    WITH parsed AS (
      SELECT DISTINCT
        cd.closed_at,
        cd.ledger_sequence,
        cd.contract_id AS pool,
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS asset,
        TRY_CAST(regexp_extract(cd.val_decoded, '"d_rate"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE) AS d_rate,
        TRY_CAST(regexp_extract(cd.val_decoded, '"d_supply"\\},"val":\\{"i128":"([0-9]+)"', 1) AS DOUBLE) AS d_supply
      FROM stellar.contract_data cd
      WHERE cd.contract_id IN (${V1_POOLS.map((pool) => `'${pool}'`).join(", ")})
        AND cd.closed_at < DATE '${options.dateString}' + interval '1' day
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
        ) AS prev_d_supply
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
        ) AS borrow_interest_raw
      FROM ordered
    )

    SELECT
      asset,
      SUM(borrow_interest_raw) AS borrow_interest_raw
    FROM daily
    WHERE day = DATE '${options.dateString}'
    GROUP BY 1
    HAVING SUM(borrow_interest_raw) > 0
  `;

  const rows: BlendV1Row[] = await queryDuneSql(options, query);

  rows.forEach(({ asset, borrow_interest_raw }) => {
    dailyFees.add(asset, Number(borrow_interest_raw), METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(asset, Number(borrow_interest_raw), "Borrow Interest To Lenders And Backstop");
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Total borrow interest accrued across Blend v1 pools.",
  SupplySideRevenue: "All Blend v1 borrow interest is paid to pool suppliers and backstop participants.",
  Revenue: "Blend v1 does not retain protocol revenue from pool borrow interest.",
  ProtocolRevenue: "Blend v1 does not retain treasury revenue from pool borrow interest.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2024-05-02",
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Total interest paid by Blend v1 borrowers, calculated from debt rate growth.",
    },
    SupplySideRevenue: {
      "Borrow Interest To Lenders And Backstop": "Total v1 borrow interest paid to pool suppliers and backstop participants.",
    },
  },
};

export default adapter;
