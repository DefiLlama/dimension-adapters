import { CHAIN } from "../../helpers/chains";
import { LIGHTER_PARTNER_FEES_LABEL } from "../../helpers/lighter";

// PerpPilot (https://perppilot.io, https://x.com/PerpPilot_io): automated perp trading bots that place orders on
// Hyperliquid, Lighter, Lighter on Robinhood Chain, Extended and Nado with PerpPilot's builder/partner code attached.
// Each venue pays PerpPilot a builder fee on top of its own trading fees; PerpPilot pays nothing to the venues.
// Builder ids below were supplied by the PerpPilot team. Previously listed as perp-pilot in factory/lighter.ts (zkLighter only).
// Not tracked: GRVT (builder account 0xc5be...f708) and AFX (builder address 0xc5be...f708), both retired by PerpPilot
// on 2026-10-05 with no public per-builder history; Phemex, a centralized exchange without builder codes.

// PerpPilot's builder identity on each venue, and the fee label each venue's fees are reported under
export const PERP_PILOT_CONFIG = {
  // the same wallet owns the Hyperliquid builder code and the Lighter, Nado, GRVT and AFX builder accounts
  hyperliquid: {
    builderAddress: "0xc5be9a8d99f7b508fcf24f4c9dbf39e5f584f708",
    feesLabel: "Hyperliquid Builder Code Fees",
  },
  // integrator (partner) account indexes owned by 0xc5be...f708, per Lighter deployment (/api/v1/accountsByL1Address)
  lighter: {
    zkLighterAccountIndex: "724608",
    robinhoodAccountIndex: "23815", // Lighter on Robinhood Chain (dexs/lighter-rh)
    feesLabel: LIGHTER_PARTNER_FEES_LABEL,
  },
  // read through fetchBuilderData (helpers/extended-exchange.ts) from Extended's public builder dashboard, which lists
  // builders by name, not by builder id; it only serves the last ~31 days and reports Extended's own trading fees, not
  // the builder fee, so Extended is tracked for volume only
  extended: {
    builderId: 248806, // the id PerpPilot sends on its orders, kept for reference
    builderName: "PerpPilot",
  },
  // builder fees are emitted on-chain per fill by the Nado offchain exchange contract on Ink
  // https://explorer.inkonchain.com/address/0x8373C3Aa04153aBc0cfD28901c3c971a946994ab
  nado: {
    builderId: 4300,
    offchainExchange: "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab",
    feesLabel: "Nado Builder Fees",
  },
} as const;

// one entry per chain, discriminated by venue so venue-specific fields (the Lighter account) are required where they apply
export type ChainConfig = { start: string } & (
  | { venue: "hyperliquid" }
  | { venue: "lighter"; lighterAccountIndex: string }
  | { venue: "extended" }
  | { venue: "nado" }
);

// start = first UTC day each source has PerpPilot activity
export const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.HYPERLIQUID]: { start: "2026-05-03", venue: "hyperliquid" }, // first builder fill file
  [CHAIN.ZK_LIGHTER]: { start: "2026-05-09", venue: "lighter", lighterAccountIndex: PERP_PILOT_CONFIG.lighter.zkLighterAccountIndex },
  [CHAIN.ROBINHOOD]: { start: "2026-09-08", venue: "lighter", lighterAccountIndex: PERP_PILOT_CONFIG.lighter.robinhoodAccountIndex },
  // Extended settles on Arc since 2026-10-22 (before that on Starknet), the same split as DefiLlama's own Extended listing
  // (dexs/extended). The builder dashboard keeps the old api.starknet.extended.exchange host name but covers both.
  // Days the dashboard no longer serves (older than ~31 days) are stored as $0 Extended volume, so run the backfill while
  // the start is still inside that window.
  [CHAIN.ARC]: { start: "2026-10-22", venue: "extended" },
  [CHAIN.INK]: { start: "2026-06-27", venue: "nado" }, // first BuilderFeePayment for builder 4300, tx 0xe504ab7511c85eb41e999a0ce6d4ccc332452994c872ab1ad8c75308d8e08882
};
