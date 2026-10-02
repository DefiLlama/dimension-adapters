import { exportLighterPartnerAdapter } from "../helpers/lighter";
import { createFactoryExports } from "./registry";

// Lighter partners (builder codes), one listing per partner, account indexes from https://lighter.exchange/stats?tab=partners
// Already tracked elsewhere: telegram-wallet-perps, insilico, minaraai-perps, pear-interface, taco-trade, vooi.
// Not listed: Atoma Fi (383032) and lunch.fun (735079) are a single client earning $0 in fees, Cryexc (712390) earned ~$1 on ~$27M volume.
const configs: Record<string, { accountIndex: string; name: string; start: string }> = {
  "myliquidbot": { accountIndex: "722954", name: "MyLiquidBot", start: "2026-04-21" }, // https://myliquidbot.com
  "perp-pilot": { accountIndex: "724608", name: "Perp Pilot", start: "2026-05-09" },
  "tealstreet": { accountIndex: "158385", name: "Tealstreet", start: "2026-04-02" }, // https://tealstreet.io
  "infinex-lighter": { accountIndex: "719006", name: "Infinex", start: "2026-03-29" }, // https://infinex.xyz
  "liquid-lighter": { accountIndex: "735594", name: "Liquid", start: "2025-10-14" }, // "Liquid Trading" on the partners page, https://liquid.trade
  "pocket-universe-lighter": { accountIndex: "737834", name: "Pocket Universe", start: "2026-08-18" }, // https://www.pocketuniverse.app
};

const protocols: Record<string, any> = {};
for (const [slug, { accountIndex, ...props }] of Object.entries(configs))
  protocols[slug] = exportLighterPartnerAdapter(accountIndex, props);

export const { protocolList, getAdapter } = createFactoryExports(protocols);
