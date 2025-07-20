/*****************************************************************************************
 * fpex‑v3 TVL & Fees Adapter  (getGraphDimensions2 wrapper)
 * ----------------------------------------------------------------------------
 *  • Pulls daily volume/fees plus protocol & supply‑side breakdown
 *  • Works with the standard Uniswap‑V3 schema:
 *        - Factory.totalVolumeUSD   (running total)
 *        - UniswapDayData.volumeUSD & feesUSD (daily)
 *
 *  If you deploy fpex to additional chains, just:
 *     1.  add another key in `endpoints`
 *     2.  add a UNIX start‑timestamp in `startTimes`
 *     3.  done.
 *****************************************************************************************/

import { Chain, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

/* ────────────────────────────────────────────────────────────────────────────
   1.  SUBGRAPH ENDPOINTS
   ────────────────────────────────────────────────────────────────────────── */
const endpoints: Record<string, string> = {
  /* Your live Goldsky (or The Graph) URL. Update the path only if it changes. */
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cmbnjfb9bfd3001tj08r4hq5c/subgraphs/flareswap/1.0.0/gn",
  // If fpex exists on other chains, add them:
  // [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/…",
};

/* ────────────────────────────────────────────────────────────────────────────
   2.  getGraphDimensions2 CONFIG
   ────────────────────────────────────────────────────────────────────────── */
const fpexGraphs = getGraphDimensions2({
  graphUrls: endpoints,
  /* ---------- “total volume” lives on the Factory entity ---------- */
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  /* ---------- fee split – customise if your economics differ ------- */
  feesPercent: {
    type: "fees",      // tells the helper to look at *.feesUSD
    UserFees: 100,     // traders pay the full fee
    SupplySideRevenue: 100,  // LPs receive the full fee
    Revenue: 0,        // protocol/tresury currently takes nothing
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
  },
});

/* ────────────────────────────────────────────────────────────────────────────
   3.  SUBGRAPH START TIMES   (unix seconds, start‑of‑day UTC)
   ────────────────────────────────────────────────────────────────────────── */
const startTimes: Record<string, number> = {
  /* fpex launched 2025‑07‑01 00:00 UTC → 1 751 328 000 s */
  [CHAIN.FLARE]: 1751328000,
  // [CHAIN.ARBITRUM]: …,
};
/* ────────────────────────────────────────────────────────────────────────────
   4.  METHODOLOGY  (displayed on DefiLlama)
   ────────────────────────────────────────────────────────────────────────── */
const methodology = {
  Fees: "Each pool charges between 0.01 % and 1 % per swap.",
  UserFees: "Traders pay the pool’s swap fee on every transaction.",
  Revenue: "The protocol treasury currently does not retain any portion of fees.",
  ProtocolRevenue: "0 % of fees are sent to the treasury.",
  HoldersRevenue: "Token holders do not earn fees directly.",
  SupplySideRevenue:
    "100 % of fees are distributed to LPs proportional to their liquidity.",
};

/* ────────────────────────────────────────────────────────────────────────────
   5.  BUILD CHAIN‑SPECIFIC ADAPTER OBJECT
   ────────────────────────────────────────────────────────────────────────── */
const adapterPerChain = Object.keys(endpoints).reduce<Record<string, any>>(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: fpexGraphs(chain as Chain),
      start: startTimes[chain],
      meta: { methodology },
    },
  }),
  {},
);

/* ────────────────────────────────────────────────────────────────────────────
   6.  EXPORT
   ────────────────────────────────────────────────────────────────────────── */
const adapter: SimpleAdapter = {
  version: 2,
  adapter: adapterPerChain,
};

export default adapter;
