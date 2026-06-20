import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

/**
 * NEAR Intents fees - sourced from Dune (revenue.near.org methodology).
 *
 * Fees: gross fees charged on every swap - the protocol fee plus the affiliate
 *   (distribution) fee each frontend collects, summed across all integrators.
 *   Mirrors revenue.near.org "Total generated fees" (dune query 6162763).
 *
 * Revenue: NEAR's net captured revenue, measured as NEAR/wNEAR swept into its
 *   revenue wallets (NEAR's own query 6740088). Reconciles with revenue.near.org
 *   "Revenue by Stream" total (~2.4M NEAR / ~$4.2M) and the on-chain buyback.
 *   Split by destination wallet (NEAR's query 6732239 designations):
 *     - Front-end Affiliate Revenue = the front-end fund (fefundsadmin, "fe").
 *     - Other Revenue = the 1Click fund (1csfundsadmin) + buyback wallet, i.e.
 *       1Click/partner revenue shares, quote improvement, private agreements.
 *
 * SupplySideRevenue is intentionally NOT reported. The fees paid out to solvers
 *   and third-party frontends would be gross fees minus NEAR's captured revenue,
 *   but NEAR realizes its revenue in periodic (≈ monthly) on-chain sweeps, so on
 *   a sweep day the swept amount far exceeds that day's accrued gross fees and a
 *   daily fees-minus-revenue figure is meaningless/negative. The per-day split
 *   of the sweep across the days it was earned (and NEAR-vs-third-party) is
 *   NEAR's backend logic and not derivable on-chain, so supply-side is omitted.
 *
 * ProtocolRevenue / HoldersRevenue: captured revenue is held in treasury before
 *   BUYBACK_START and, since 2026-02-23, used to buy back $NEAR (not burned).
 */

// Date NEAR began using captured Intents revenue to buy back $NEAR
const BUYBACK_START = '2026-02-23';

const FRONTEND_WALLET = 'fefundsadmin.sputnik-dao.near'; // NEAR front-end fund ("fe")
// All of NEAR's revenue wallets (NEAR's own dune query 6740088)
const FEE_WALLETS = `(VALUES
  ('fefundsadmin.sputnik-dao.near'),
  ('1csfundsadmin.sputnik-dao.near'),
  ('buybacks.multisignature.near')
) AS t(wallet)`;

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH fee_wallets AS (SELECT wallet FROM ${FEE_WALLETS}),
    gross AS (
      SELECT SUM(fee) AS fees_usd FROM (
        SELECT CAST(amount_fee AS double) AS fee
        FROM dune.near.dataset_near_intents_protocol_fees
        WHERE CAST(from_iso8601_timestamp(date_at) AS DATE) = DATE '${options.dateString}'
        UNION ALL
        SELECT CAST(fee AS double) AS fee
        FROM dune.near.dataset_near_intents_fees
        WHERE CAST(from_iso8601_timestamp(date_at) AS DATE) = DATE '${options.dateString}'
      )
    ),
    moves AS (
      SELECT receipt_receiver_account_id AS wallet, CAST(action_transfer_deposit AS DOUBLE) / 1e24 AS amt
      FROM near.actions
      WHERE action_kind = 'TRANSFER' AND execution_status = 'SUCCESS_VALUE'
        AND receipt_receiver_account_id IN (SELECT wallet FROM fee_wallets)
        AND block_date = DATE '${options.dateString}'
      UNION ALL
      SELECT affected_account_id AS wallet, CAST(delta_amount AS DOUBLE) / 1e24 AS amt
      FROM near.ft_transfers
      WHERE contract_account_id = 'wrap.near' AND delta_amount > 0
        AND affected_account_id IN (SELECT wallet FROM fee_wallets)
        AND block_date = DATE '${options.dateString}'
    )
    SELECT
      COALESCE((SELECT fees_usd FROM gross), 0) AS fees_usd,
      COALESCE((SELECT SUM(amt) FROM moves WHERE wallet = '${FRONTEND_WALLET}'), 0) AS frontend_near,
      COALESCE((SELECT SUM(amt) FROM moves WHERE wallet <> '${FRONTEND_WALLET}'), 0) AS other_near
  `;

  const res = await queryDuneSql(options, query);
  const fees_usd = res[0]?.fees_usd ?? 0;
  const frontend_near = res[0]?.frontend_near ?? 0;
  const other_near = res[0]?.other_near ?? 0;
  const revenue_near = frontend_near + other_near;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees_usd, 'Swap Fees');

  // Total revenue = captured, split by destination wallet (both >= 0).
  const dailyRevenue = options.createBalances();
  dailyRevenue.addCGToken('near', frontend_near, 'Front-end Affiliate Revenue');
  dailyRevenue.addCGToken('near', other_near, 'Other Revenue');

  // Captured revenue: treasury before the buyback program, $NEAR buybacks after.
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  if (options.dateString >= BUYBACK_START) {
    dailyHoldersRevenue.addCGToken('near', revenue_near, 'NEAR Buyback');
  } else {
    dailyProtocolRevenue.addCGToken('near', revenue_near, 'NEAR Treasury');
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2024-12-10', // first date with fee data in the Dune datasets
  chains: [CHAIN.NEAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Gross fees charged on NEAR Intents swaps - the protocol fee plus the affiliate (distribution) fee each frontend collects, summed across all integrators.",
    Revenue: "NEAR's net captured revenue, measured as NEAR/wNEAR swept into its revenue wallets (reconciles with revenue.near.org and the on-chain buyback). Split by destination wallet into front-end affiliate revenue and Other.",
    ProtocolRevenue: "Captured revenue held by the treasury before the 2026-02-23 buyback program.",
    HoldersRevenue: "Since 2026-02-23, NEAR's captured Intents revenue is used to buy back $NEAR on the open market (not burned), returning value to holders.",
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': "Gross protocol + affiliate fees charged on NEAR Intents swaps across all integrators.",
    },
    Revenue: {
      'Front-end Affiliate Revenue': "Revenue collected by NEAR's front-end fund wallet (near.com / app.near-intents.org).",
      'Other Revenue': "All other captured revenue: 1Click and partner revenue shares, quote improvement (positive slippage), private agreements, and buyback-wallet flows.",
    },
    ProtocolRevenue: {
      'NEAR Treasury': "Captured revenue retained by the treasury before the 2026-02-23 buyback program.",
    },
    HoldersRevenue: {
      'NEAR Buyback': "$NEAR bought back on the open market with captured Intents revenue, from 2026-02-23 onward.",
    },
  },
};

export default adapter;
