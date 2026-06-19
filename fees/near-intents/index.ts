import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

/**
 * NEAR Intents fees - sourced from Dune (revenue.near.org methodology).
 *
 * Many frontends route swaps through NEAR Intents and each collects its own
 * affiliate (distribution) fee. We split the daily fee dataset by referral:
 *   - Fees: protocol fee + every frontend's affiliate fee (gross). Mirrors
 *     revenue.near.org "Total generated fees" (dune query 6162763).
 *   - Revenue: the share NEAR keeps = its own frontends' affiliate fees + the
 *     protocol fee. Approximates revenue.near.org's "Front-end" revenue stream.
 *   - SupplySideRevenue: the affiliate fees earned by third-party frontends and
 *     solvers = gross fees minus NEAR's share. Always >= 0 (it is a subset of
 *     the same daily dataset), so no negative supply-side and no lumpy wallet
 *     sweeps.
 *
 * Revenue destination: NEAR's captured revenue is held in treasury before
 *   BUYBACK_START and, since 2026-02-23, used to buy back $NEAR (not burned) -
 *   "Evolving NEAR tokenomics". Attributed to ProtocolRevenue before / Holders
 *   Revenue on-or-after that date.
 *
 * NOTE: NEAR's exact front-end referral classification lives in its backend and
 *   is not public; NEAR_FRONTEND_REFERRALS is a best-effort allowlist of NEAR's
 *   own frontends and may undercount vs the dashboard's "Front-end" stream.
 *   The "Quote Improvement" stream (positive slippage) is not in the fee dataset
 *   and is not captured here. Tune the allowlist as NEAR's frontends are confirmed.
 */

// Date NEAR began using captured Intents revenue to buy back $NEAR
const BUYBACK_START = '2026-02-23';

// NEAR's own frontends' referral codes - their affiliate fees are NEAR revenue.
// Every other referral is a third-party channel (supply side), including the
// largest fee generators: swapkit (SwapKit cross-chain SDK powering THORSwap and
// many wallets - ~78% of all fees, kept by SwapKit) and zashi. The
// `.intents-referral.near` suffix is NEAR's shared referral registry, so only
// NEAR-owned sub-accounts belong here (solswap/trumpswap/infinex are third party).
const NEAR_FRONTEND_REFERRALS = [
  'near-intents.intents-referral.near', // near.com / app.near-intents.org
  'new.intents-referral.near',
  'near-intents-app',
  'near-mobile',
  'intents.tg',
];

const fetch = async (options: FetchOptions) => {
  const frontendList = NEAR_FRONTEND_REFERRALS.map((r) => `'${r}'`).join(', ');
  const query = `
    WITH prot AS (
      SELECT SUM(CAST(amount_fee AS double)) AS usd
      FROM dune.near.dataset_near_intents_protocol_fees
      WHERE CAST(from_iso8601_timestamp(date_at) AS DATE) = DATE '${options.dateString}'
    ),
    ref AS (
      SELECT
        SUM(CASE WHEN referral IN (${frontendList})
                 THEN CAST(fee AS double) ELSE 0 END) AS frontend_usd,
        SUM(CASE WHEN referral IS NULL OR referral NOT IN (${frontendList})
                 THEN CAST(fee AS double) ELSE 0 END) AS thirdparty_usd
      FROM dune.near.dataset_near_intents_fees
      WHERE CAST(from_iso8601_timestamp(date_at) AS DATE) = DATE '${options.dateString}'
    )
    SELECT
      COALESCE((SELECT usd FROM prot), 0) AS protocol_usd,
      COALESCE((SELECT frontend_usd FROM ref), 0) AS frontend_usd,
      COALESCE((SELECT thirdparty_usd FROM ref), 0) AS thirdparty_usd
  `;

  const res = await queryDuneSql(options, query);
  const protocol_usd = res[0]?.protocol_usd ?? 0;
  const frontend_usd = res[0]?.frontend_usd ?? 0;
  const thirdparty_usd = res[0]?.thirdparty_usd ?? 0;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(frontend_usd, 'NEAR Frontend Affiliate Fees');
  dailyFees.addUSDValue(thirdparty_usd, 'Third-Party Affiliate Fees');
  dailyFees.addUSDValue(protocol_usd, 'Protocol Fee');

  // NEAR keeps its own frontends' affiliate fees + the protocol fee.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(frontend_usd, 'NEAR Frontend Affiliate Fees');
  dailyRevenue.addUSDValue(protocol_usd, 'Protocol Fee');

  // The rest is earned by third-party frontends and solvers.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(thirdparty_usd, 'Third-Party Affiliate Fees');

  // Captured revenue: treasury before the buyback program, $NEAR buybacks after.
  const captured = frontend_usd + protocol_usd;
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  if (options.dateString >= BUYBACK_START) {
    dailyHoldersRevenue.addUSDValue(captured, 'NEAR Buyback');
  } else {
    dailyProtocolRevenue.addUSDValue(captured, 'NEAR Treasury');
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
  methodology: {
    Fees: "Gross fees charged on NEAR Intents swaps - the protocol fee plus the affiliate (distribution) fee each frontend collects, summed across all integrators.",
    Revenue: "The share NEAR keeps: affiliate fees from NEAR's own frontends plus the protocol fee. The affiliate fees earned by third-party frontends are excluded.",
    ProtocolRevenue: "Captured revenue held by the treasury before the 2026-02-23 buyback program.",
    HoldersRevenue: "Since 2026-02-23, NEAR's captured Intents revenue is used to buy back $NEAR on the open market (not burned), returning value to holders.",
    SupplySideRevenue: "Affiliate fees earned by third-party frontends and solvers - gross fees minus the share NEAR keeps.",
  },
  breakdownMethodology: {
    Fees: {
      'NEAR Frontend Affiliate Fees': "Affiliate fees collected by NEAR's own frontends.",
      'Third-Party Affiliate Fees': "Affiliate fees collected by third-party frontends/integrators.",
      'Protocol Fee': "The NEAR Intents protocol fee charged on each swap.",
    },
    Revenue: {
      'NEAR Frontend Affiliate Fees': "Affiliate fees from NEAR's own frontends (kept by NEAR).",
      'Protocol Fee': "The protocol fee, retained 100% by NEAR.",
    },
    ProtocolRevenue: {
      'NEAR Treasury': "Captured revenue retained by the treasury before the 2026-02-23 buyback program.",
    },
    HoldersRevenue: {
      'NEAR Buyback': "$NEAR bought back on the open market with captured Intents revenue, from 2026-02-23 onward.",
    },
    SupplySideRevenue: {
      'Third-Party Affiliate Fees': "Affiliate fees paid out to third-party frontends and solvers.",
    },
  },
};

export default adapter;
