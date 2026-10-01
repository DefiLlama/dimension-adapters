import { CHAIN } from "../helpers/chains";
import { exportLighterPartnerAdapter, type LighterPartnerConfig } from "../helpers/lighter";
import { createFactoryExports } from "./registry";

// Lighter partners (builder codes), one listing per partner, account indexes from https://lighter.exchange/stats?tab=partners
// Already tracked elsewhere: telegram-wallet-perps, insilico, minaraai-perps, pear-interface, taco-trade, onagi-perps, lifi-perps, vooi.
// Not listed: Atoma Fi (383032) and lunch.fun (735079) are a single client earning $0 in fees, Cryexc (712390) earned ~$1 on ~$27M volume.
// A partner can be integrated with several Lighter deployments (zklighter, robinhood) and can rotate accounts on one:
// list each account index with its active days, see LighterAccountConfig in helpers/lighter.ts.
const configs: Record<string, LighterPartnerConfig> = {
  "myliquidbot": { name: "MyLiquidBot", chains: { [CHAIN.ZK_LIGHTER]: { start: "2026-04-21", accounts: ["722954"] } } }, // https://myliquidbot.com
  "perp-pilot": { name: "Perp Pilot", chains: { [CHAIN.ZK_LIGHTER]: { start: "2026-05-09", accounts: ["724608"] } } },
  "tealstreet": { name: "Tealstreet", chains: { [CHAIN.ZK_LIGHTER]: { start: "2026-04-02", accounts: ["158385"] } } }, // https://tealstreet.io
  "infinex-lighter": { name: "Infinex", chains: { [CHAIN.ZK_LIGHTER]: { start: "2026-03-29", accounts: ["719006"] } } }, // https://infinex.xyz
  "liquid-lighter": { name: "Liquid", chains: { [CHAIN.ZK_LIGHTER]: { start: "2025-10-14", accounts: ["735594"] } } }, // "Liquid Trading" on the partners page, https://liquid.trade
  "pocket-universe-lighter": { name: "Pocket Universe", chains: { [CHAIN.ZK_LIGHTER]: { start: "2026-08-18", accounts: ["737834"] } } }, // https://www.pocketuniverse.app
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) protocols[slug] = exportLighterPartnerAdapter(config);

export const { protocolList, getAdapter } = createFactoryExports(protocols);
