import { CHAIN } from "../../helpers/chains";

// PerpPilot (https://www.perppilot.app, https://x.com/PerpPilot_io): automated perp trading bots that place orders on
// Hyperliquid, Lighter, Lighter on Robinhood Chain, Extended and Nado with PerpPilot's builder/partner code attached.
// Each venue pays PerpPilot a builder fee on top of its own trading fees; PerpPilot pays nothing to the venues.
// Builder ids below were supplied by the PerpPilot team. Previously listed as perp-pilot in factory/lighter.ts (zkLighter only).
// Not tracked: GRVT (builder account 0xc5be...f708) and AFX (builder address 0xc5be...f708), both retired by PerpPilot
// on 2026-10-05 with no public per-builder history; Phemex, a centralized exchange without builder codes.

// Hyperliquid builder address, the same wallet owns the Lighter and GRVT/AFX builder accounts
export const HL_BUILDER_ADDRESSES = ["0xc5be9a8d99f7b508fcf24f4c9dbf39e5f584f708"];
export const HL_BUILDER_FEES_LABEL = "Hyperliquid Builder Code Fees";

// Extended builder "PerpPilot" (builder id 248806) on the public builder dashboard
// The dashboard only serves the last ~31 days and reports Extended's own trading fees, not the builder fee, so
// Extended is tracked for volume only.
export const EXTENDED_BUILDERS_API = "https://api.starknet.extended.exchange/api/v1/info/builder/dashboard";
export const EXTENDED_BUILDER_NAME = "PerpPilot";

// Nado (Ink) builder id 4300, builder fees are emitted on-chain per fill by the Nado offchain exchange contract
// https://explorer.inkonchain.com/address/0x8373C3Aa04153aBc0cfD28901c3c971a946994ab
export const NADO_OFFCHAIN_EXCHANGE = "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab";
export const NADO_BUILDER_ID = 4300;
export const NADO_BUILDER_FEES_LABEL = "Nado Builder Fees";

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
  [CHAIN.ZK_LIGHTER]: { start: "2026-05-09", venue: "lighter", lighterAccountIndex: "724608" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-08", venue: "lighter", lighterAccountIndex: "23815" }, // Lighter on Robinhood Chain (dexs/lighter-rh)
  [CHAIN.STARKNET]: { start: "2026-10-16", venue: "extended" }, // earliest day the Extended dashboard still serves
  [CHAIN.INK]: { start: "2026-06-27", venue: "nado" }, // first BuilderFeePayment for builder 4300, tx 0xe504ab7511c85eb41e999a0ce6d4ccc332452994c872ab1ad8c75308d8e08882
};
