import { PapertradeBuilderConfig, papertradeBuilderFeesExports } from "../helpers/papertrade";
import { createFactoryExports } from "./registry";

// Approved builders from https://exchange.papertrade.xyz/builders
const builderConfigs: Record<string, PapertradeBuilderConfig> = {
  "evplusai-papertrade": { builder: "0xace5237ffc80df0964f0ebfd077c7ef63031659c", name: "EVplusAI", start: "2026-10-26" }, // also evplusai-perps (Hyperliquid) and evplusai (Polymarket)
  "papercopy": { builder: "0x5ec19b48741322ec4c54fd642ffc7ed306ef4a4c", name: "papercopy", start: "2026-10-25" },
  "paperplane-cash": { builder: "0xecd7762572468175cd1cdbb3fabd80a8e585c71b", name: "Paperplane.cash", start: "2026-10-25" },
  "trademarkets": { builder: "0x6169d2c383451347b98faadec6f635aa59d8e4c4", name: "trademarkets", start: "2026-10-26" },
  "tendies-cup": { builder: "0x497f682c83b461c2f1f3c4ea8bc0154b2ec46fcc", name: "Tendies Cup", start: "2026-10-26" },
  "paper-control": { builder: "0xf767bb837e6482009c9af984fc2fd2c234caabe1", name: "Paper Control", start: "2026-10-26" },
  "paperfight": { builder: "0x6fdd4c1582817e20783f7db673ab03b9a35e689f", name: "PaperFight", start: "2026-10-26" },
  "paperfactory": { builder: "0x1d8b493c7104c175eaee37c41faf2194962778ef", name: "paperfactory.xyz", start: "2026-10-26" },
  "paper-clash": { builder: "0x20b66bae94b2d611d4a336ba1e04f5453b70877a", name: "Paper Clash", start: "2026-10-25" },
  "moistly": { builder: "0x1b4c289c4f6e0565f1e432654254485c490679e9", name: "Moistly", start: "2026-10-25" },
  // approved builders that began routing after the first batch above; start = first UTC day each has a close on exchange.papertrade.xyz
  "paperpro-papertrade": { builder: "0xd0d70b60426fbb01d250c6bf0136addc7aff721a", name: "PaperPro", start: "2026-10-26" },
  "paperdream-papertrade": { builder: "0xa13d49fcbf79eaf6a0a58cbdd3361422db4eaff1", name: "paperdream", start: "2026-10-25" },
  "paperstrategy-papertrade": { builder: "0xe40fd5101c7e7a433eab45303245ea04e65129c2", name: "paperstrategy", start: "2026-10-26" }, // distinct from fees/paperstrategy.ts (the PSTR token)
  "paperbird-papertrade": { builder: "0xae1457a48d4e858a87b83fbd78209c8df950f889", name: "paperbird.lol", start: "2026-10-26" },
  "paperplanes-papertrade": { builder: "0x5ea218795bedb8393298b75a3ae4e9301a0b6153", name: "Paperplanes", start: "2026-10-25" }, // distinct from paperplane-cash above
  "paperdash-papertrade": { builder: "0xdf1ec355702bec70c7ffc8bc2fd5403575091a64", name: "Paperdash", start: "2026-10-26" },
  "wallet-v-papertrade": { builder: "0x68c68ba58f50bdbe5c4a6faf0186b140eab2b764", name: "Wallet V", start: "2026-10-27" }, // same operator as the wallet-v Hyperliquid builder code in factory/hyperliquid.ts
  "party-by-hit-one-papertrade": { builder: "0x7be2f61af1b47c70322bdb5dea3b3227538e6087", name: "Party by Hit One", start: "2026-10-26" },
  "the-pit-papertrade": { builder: "0x7c1f79b0e4fe2035a58711fa831de86297f3ff2e", name: "The Pit", start: "2026-10-26" },
};

const feesProtocols = Object.fromEntries(
  Object.entries(builderConfigs).map(([slug, config]) => [slug, papertradeBuilderFeesExports(config)]),
);

// Volume is not listed, same as dexs/papertrade.ts: the notional of 1000x synthetic bets against the house is not comparable
// with perp venues. To list it, uncomment this and 'papertrade' under dexs in factory/registry.ts.
// const dexsProtocols = Object.fromEntries(
//   Object.entries(builderConfigs).map(([slug, config]) => [slug, papertradeBuilderVolumeExports(config)]),
// );
// export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);

export const fees = createFactoryExports(feesProtocols);
