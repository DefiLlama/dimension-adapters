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
 * Revenue: NEAR's net captured revenue across all streams (front-end, quote
 *   improvement, authorized/unauthorized partner, private agreement), measured
 *   as NEAR/wNEAR swept into NEAR's revenue wallets - NEAR's own "NEAR Intents
 *   Revenue" (dune query 6740088). Reconciles with revenue.near.org's "Revenue
 *   by Stream" total (~2.4M NEAR) and with the on-chain buyback.
 *
 * SupplySideRevenue: gross fees minus NEAR's captured revenue - the share paid
 *   to solvers and third-party distribution channels (e.g. SwapKit, the largest,
 *   keeps its own affiliate fee). NEAR realizes its revenue in periodic on-chain
 *   sweeps, so on a sweep day captured revenue can exceed that day's accrued
 *   gross fees and supply-side goes briefly negative (allowNegativeValue); it
 *   nets out positive over any window.
 *
 * ProtocolRevenue / HoldersRevenue: captured revenue is held in treasury before
 *   BUYBACK_START and, since 2026-02-23, used to buy back $NEAR (not burned) -
 *   "Evolving NEAR tokenomics".
 */

// Date NEAR began using captured Intents revenue to buy back $NEAR
const BUYBACK_START = '2026-02-23';

// NEAR's revenue wallets (NEAR's own dune query 6740088)
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
    native AS (
      SELECT SUM(CAST(action_transfer_deposit AS DOUBLE) / 1e24) AS near_amt
      FROM near.actions
      WHERE action_kind = 'TRANSFER' AND execution_status = 'SUCCESS_VALUE'
        AND receipt_receiver_account_id IN (SELECT wallet FROM fee_wallets)
        AND block_date = DATE '${options.dateString}'
    ),
    wnear AS (
      SELECT SUM(CAST(delta_amount AS DOUBLE) / 1e24) AS near_amt
      FROM near.ft_transfers
      WHERE contract_account_id = 'wrap.near' AND delta_amount > 0
        AND affected_account_id IN (SELECT wallet FROM fee_wallets)
        AND block_date = DATE '${options.dateString}'
    )
    SELECT
      COALESCE((SELECT fees_usd FROM gross), 0) AS fees_usd,
      COALESCE((SELECT near_amt FROM native), 0) + COALESCE((SELECT near_amt FROM wnear), 0) AS revenue_near
  `;

  const res = await queryDuneSql(options, query);
  const fees_usd = res[0]?.fees_usd ?? 0;
  const revenue_near = res[0]?.revenue_near ?? 0;

  const dailyRevenue = options.createBalances();
  dailyRevenue.addCGToken('near', revenue_near, 'Captured Intents Revenue');
  const revenue_usd = await dailyRevenue.getUSDValue();

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees_usd, 'Swap Fees');

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(fees_usd - revenue_usd, 'Fees To Solvers & Distribution Channels');

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
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2024-12-10', // first date with fee data in the Dune datasets
  chains: [CHAIN.NEAR],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true, // sweep days: captured revenue can exceed that day's accrued fees
  methodology: {
    Fees: "Gross fees charged on NEAR Intents swaps - the protocol fee plus the affiliate (distribution) fee each frontend collects, summed across all integrators.",
    Revenue: "NEAR's net captured revenue across all streams (front-end, quote improvement, authorized/unauthorized partner, private agreement), measured as NEAR/wNEAR swept into NEAR's revenue wallets. Reconciles with revenue.near.org's Revenue by Stream and the on-chain buyback.",
    ProtocolRevenue: "Captured revenue held by the treasury before the 2026-02-23 buyback program.",
    HoldersRevenue: "Since 2026-02-23, NEAR's captured Intents revenue is used to buy back $NEAR on the open market (not burned), returning value to holders.",
    SupplySideRevenue: "Gross fees minus NEAR's captured revenue - the affiliate fees kept by solvers and third-party distribution channels (e.g. SwapKit).",
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': "Gross protocol + affiliate fees charged on NEAR Intents swaps across all integrators.",
    },
    Revenue: {
      'Captured Intents Revenue': "NEAR/wNEAR swept into NEAR's revenue wallets (fefundsadmin, 1csfundsadmin, buybacks.multisignature) across all revenue streams.",
    },
    ProtocolRevenue: {
      'NEAR Treasury': "Captured revenue retained by the treasury before the 2026-02-23 buyback program.",
    },
    HoldersRevenue: {
      'NEAR Buyback': "$NEAR bought back on the open market with captured Intents revenue, from 2026-02-23 onward.",
    },
    SupplySideRevenue: {
      'Fees To Solvers & Distribution Channels': "Gross fees less NEAR's captured share - kept by solvers and third-party distribution channels.",
    },
  },
};

export default adapter;
