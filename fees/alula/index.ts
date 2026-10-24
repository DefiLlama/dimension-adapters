import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Alula market contracts on Stellar: the current main market and the deprecated one, which
// keeps accruing interest on its open loans until they are repaid.
const MARKETS = [
  "CCA56KMCEEAK2SGMHNU7TYJUO7GP5KSDTTFB6ZS2NQY7VQ3SKWLMTEB4",
  "CBP76I2FRMUKYKIYYBKN3DH7TSWMFAJF2WTDC7Q2OHQFBIVWP7CAAI5Q",
];

type AlulaRow = {
  token: string;
  interest_raw: string | number;
  take_rate_raw: string | number;
  operation_fees_raw: string | number;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Source: Dune stellar.contract_data snapshots of each market's Pool(address) entry.
  // Borrower interest = previous total_d_tokens * growth of the d-token price
  // (total_borrowed / total_d_tokens); borrows and repays mint or burn d-tokens at that price,
  // so only accrued interest moves it. The take rate is the protocol's cut of that interest;
  // operation fees are the growth of operation_fees_sum, which resets when fees are distributed.
  const query = `
    WITH snapshots AS (
      SELECT DISTINCT
        cd.closed_at,
        cd.ledger_sequence,
        cd.contract_id AS market,
        json_extract_scalar(json_parse(cd.key_decoded), '$.vec[1].address') AS pool,
        regexp_extract(cd.val_decoded, '"token_address"\\},"val":\\{"address":"([A-Z0-9]+)"', 1) AS token,
        TRY_CAST(regexp_extract(cd.val_decoded, '"total_borrowed"\\},"val":\\{"i128":"(-?[0-9]+)"', 1) AS DOUBLE) AS total_borrowed,
        TRY_CAST(regexp_extract(cd.val_decoded, '"total_d_tokens"\\},"val":\\{"i128":"(-?[0-9]+)"', 1) AS DOUBLE) AS total_d_tokens,
        TRY_CAST(regexp_extract(cd.val_decoded, '"take_rate_bps"\\},"val":\\{"u32":([0-9]+)', 1) AS DOUBLE) AS take_rate_bps,
        TRY_CAST(regexp_extract(cd.val_decoded, '"operation_fees_sum"\\},"val":\\{"i128":"(-?[0-9]+)"', 1) AS DOUBLE) AS operation_fees_sum,
        TRY_CAST(regexp_extract(cd.val_decoded, '"take_rate_fees_sum"\\},"val":\\{"i128":"(-?[0-9]+)"', 1) AS DOUBLE) AS take_rate_fees_sum
      FROM stellar.contract_data cd
      WHERE cd.contract_id IN (${MARKETS.map((m) => `'${m}'`).join(", ")})
        AND cd.closed_at < DATE '${options.dateString}' + interval '1' day
        AND json_extract_scalar(json_parse(cd.key_decoded), '$.vec[0].symbol') = 'Pool'
    ),

    prior AS (
      SELECT closed_at, ledger_sequence, market, pool, token, total_borrowed, total_d_tokens, take_rate_bps, operation_fees_sum, take_rate_fees_sum
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY market, pool ORDER BY closed_at DESC, ledger_sequence DESC) AS rn
        FROM snapshots
        WHERE closed_at < DATE '${options.dateString}'
      )
      WHERE rn = 1
    ),

    window_rows AS (
      SELECT closed_at, ledger_sequence, market, pool, token, total_borrowed, total_d_tokens, take_rate_bps, operation_fees_sum, take_rate_fees_sum
      FROM snapshots
      WHERE closed_at >= DATE '${options.dateString}'
      UNION ALL
      SELECT * FROM prior
    ),

    ordered AS (
      SELECT
        *,
        CASE WHEN total_d_tokens > 0 THEN total_borrowed / total_d_tokens END AS d_price,
        LAG(CASE WHEN total_d_tokens > 0 THEN total_borrowed / total_d_tokens END)
          OVER (PARTITION BY market, pool ORDER BY closed_at, ledger_sequence) AS prev_d_price,
        LAG(total_d_tokens) OVER (PARTITION BY market, pool ORDER BY closed_at, ledger_sequence) AS prev_d_tokens,
        LAG(operation_fees_sum) OVER (PARTITION BY market, pool ORDER BY closed_at, ledger_sequence) AS prev_operation_fees_sum,
        LAG(take_rate_fees_sum) OVER (PARTITION BY market, pool ORDER BY closed_at, ledger_sequence) AS prev_take_rate_fees_sum
      FROM window_rows
      WHERE token IS NOT NULL
    ),

    -- A pool whose last debt is repaid has no d-token price left; its final accrual is
    -- recovered from the take-rate bucket, which grows by interest * take_rate on accrual.
    accrued AS (
      SELECT
        token,
        CASE
          WHEN d_price IS NOT NULL
            THEN GREATEST(COALESCE(prev_d_tokens, 0) * GREATEST(d_price - COALESCE(prev_d_price, d_price), 0), 0)
          WHEN COALESCE(prev_d_tokens, 0) > 0 AND COALESCE(take_rate_bps, 0) > 0
            THEN GREATEST(take_rate_fees_sum - COALESCE(prev_take_rate_fees_sum, take_rate_fees_sum), 0) * 10000 / take_rate_bps
          ELSE 0
        END AS interest_raw,
        COALESCE(take_rate_bps, 0) AS take_rate_bps,
        GREATEST(COALESCE(operation_fees_sum, 0) - COALESCE(prev_operation_fees_sum, operation_fees_sum, 0), 0) AS operation_fees_raw
      FROM ordered
      WHERE closed_at >= DATE '${options.dateString}'
    )

    SELECT
      token,
      SUM(interest_raw) AS interest_raw,
      SUM(interest_raw * take_rate_bps / 10000) AS take_rate_raw,
      SUM(operation_fees_raw) AS operation_fees_raw
    FROM accrued
    GROUP BY 1
    HAVING SUM(interest_raw) > 0 OR SUM(operation_fees_raw) > 0
  `;

  const rows: AlulaRow[] = await queryDuneSql(options, query);

  rows.forEach(({ token, interest_raw, take_rate_raw, operation_fees_raw }) => {
    const interest = Number(interest_raw);
    const takeRate = Math.min(Number(take_rate_raw), interest);
    const operationFees = Number(operation_fees_raw);

    if (interest > 0) {
      dailyFees.add(token, interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(token, takeRate, "Borrow Interest To Treasury");
      dailySupplySideRevenue.add(token, interest - takeRate, "Borrow Interest To Lenders");
    }
    if (operationFees > 0) {
      dailyFees.add(token, operationFees, "Operation Fees");
      dailyRevenue.add(token, operationFees, "Operation Fees To Treasury");
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by Alula borrowers plus operation fees on deposits, withdrawals, borrows, repayments and collateral moves.",
  Revenue: "The take rate on borrower interest (set per pool) plus operation fees, paid to the protocol and its insurance fund.",
  ProtocolRevenue: "The take rate on borrower interest (set per pool) plus operation fees, paid to the protocol and its insurance fund.",
  SupplySideRevenue: "Borrower interest net of the take rate, earned by lenders.",
};

const treasuryBreakdown = {
  "Borrow Interest To Treasury": "The pool's take rate share of borrower interest, paid to the protocol and its insurance fund.",
  "Operation Fees To Treasury": "Operation fees on deposits, withdrawals, borrows, repayments and collateral moves, paid to the protocol and its insurance fund.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2026-07-09",
  chains: [CHAIN.STELLAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest accrued on Alula loans, from the growth of each pool's d-token price (from the take-rate bucket when a pool's last debt is repaid).",
      "Operation Fees": "Operation fees charged on deposits, withdrawals, borrows, repayments and collateral moves.",
    },
    Revenue: treasuryBreakdown,
    ProtocolRevenue: treasuryBreakdown,
    SupplySideRevenue: {
      "Borrow Interest To Lenders": "Borrower interest after the take rate, paid to lenders.",
    },
  },
};

export default adapter;
