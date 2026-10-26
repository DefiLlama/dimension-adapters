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
