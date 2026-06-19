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
 *   revenue.near.org splits this into Front-end, Quote Improvement,
 *   Authorized/Unauthorized partner and Private agreement streams; those shares
 *   are computed in NEAR's backend and vary over time, and the same wallets
 *   receive every stream, so we cannot attribute the captured total to a stream
 *   from on-chain data. We therefore break Revenue into the front-end affiliate
 *   fees we CAN identify by referral and lump the remainder as "Other Revenue"
 *   (see breakdown).
 *
 * SupplySideRevenue: gross fees minus NEAR's captured revenue - the affiliate
 *   fees kept by solvers and third-party distribution channels (e.g. SwapKit,
 *   the largest). Captured revenue is realized in periodic on-chain sweeps, so
 *   on a sweep day it can exceed that day's accrued gross fees and supply-side
 *   goes briefly negative (allowNegativeValue); it nets out positive over time.
 *
 * ProtocolRevenue / HoldersRevenue: captured revenue is held in treasury before
 *   BUYBACK_START and, since 2026-02-23, used to buy back $NEAR (not burned).
 */

// Date NEAR began using captured Intents revenue to buy back $NEAR
const BUYBACK_START = '2026-02-23';

// NEAR's own frontends' referral codes - used only to split Revenue into the
// identifiable front-end affiliate portion vs Other. Best-effort (~80% of the
// dashboard's Front-end stream); the unidentified remainder falls into Other.
const NEAR_FRONTEND_REFERRALS = [
  'near-intents.intents-referral.near', // near.com / app.near-intents.org
  'new.intents-referral.near',
  'near-intents-app',
  'near-mobile',
  'intents.tg',
];

// NEAR's revenue wallets (NEAR's own dune query 6740088)
const FEE_WALLETS = `(VALUES
  ('fefundsadmin.sputnik-dao.near'),
  ('1csfundsadmin.sputnik-dao.near'),
  ('buybacks.multisignature.near')
) AS t(wallet)`;

const fetch = async (options: FetchOptions) => {
  const frontendList = NEAR_FRONTEND_REFERRALS.map((r) => `'${r}'`).join(', ');
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
    frontend AS (
      SELECT SUM(CAST(fee AS double)) AS usd
      FROM dune.near.dataset_near_intents_fees
      WHERE CAST(from_iso8601_timestamp(date_at) AS DATE) = DATE '${options.dateString}'
        AND referral IN (${frontendList})
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
      COALESCE((SELECT usd FROM frontend), 0) AS frontend_usd,
      COALESCE((SELECT near_amt FROM native), 0) + COALESCE((SELECT near_amt FROM wnear), 0) AS revenue_near
  `;

  const res = await queryDuneSql(options, query);
  const fees_usd = res[0]?.fees_usd ?? 0;
  const frontend_usd = res[0]?.frontend_usd ?? 0;
  const revenue_near = res[0]?.revenue_near ?? 0;

  // Price NEAR's captured revenue (the total that matches the buyback).
  const captured = options.createBalances();
  captured.addCGToken('near', revenue_near);
  const revenue_usd = await captured.getUSDValue();

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees_usd, 'Swap Fees');

  // Total revenue = captured; split into identifiable front-end affiliate + Other.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(frontend_usd, 'Front-end Affiliate Revenue');
  dailyRevenue.addUSDValue(revenue_usd - frontend_usd, 'Other Revenue');

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
    Revenue: "NEAR's net captured revenue, measured as NEAR/wNEAR swept into its revenue wallets (reconciles with revenue.near.org and the on-chain buyback). Split into the front-end affiliate fees identifiable by referral and Other.",
    ProtocolRevenue: "Captured revenue held by the treasury before the 2026-02-23 buyback program.",
    HoldersRevenue: "Since 2026-02-23, NEAR's captured Intents revenue is used to buy back $NEAR on the open market (not burned), returning value to holders.",
    SupplySideRevenue: "Gross fees minus NEAR's captured revenue - the affiliate fees kept by solvers and third-party distribution channels (e.g. SwapKit).",
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': "Gross protocol + affiliate fees charged on NEAR Intents swaps across all integrators.",
    },
    Revenue: {
      'Front-end Affiliate Revenue': "Affiliate fees from NEAR's own frontends (near.com / app.near-intents.org, NEAR mobile, etc.), identified by referral code.",
      'Other Revenue': "All other captured revenue: quote improvement (positive slippage), authorized/unauthorized partner revenue shares, private agreements, the protocol fee, and any front-end revenue not attributed by referral.",
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
