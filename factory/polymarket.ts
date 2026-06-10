import { polymarketBuilderExports, polymarketV2BuilderFeesExports } from "../helpers/polymarket";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, { builder: string; start: string }> = {
  "based-predict": { builder: "Based", start: "2025-11-18" },
  "betmoar-fun": { builder: "betmoar", start: "2025-10-17" },
  "flowbot-prediction": { builder: "FlowBot", start: "2025-12-31" },
  "frenflow": { builder: "FrenFlow", start: "2026-02-16" },
  "polycule": { builder: "Polycule", start: "2025-11-03" },
  "polytraderpro": { builder: "polytraderpro", start: "2025-10-22" },
  "stand-trade": { builder: "standtrade", start: "2025-10-10" },
  "rainbow-predictions": { builder: "Rainbow", start: "2025-11-12" },
  "kreo": { builder: "Kreo", start: "2026-01-09" },
  "polygun": { builder: "Polygun", start: "2025-11-27" },
  "bullpen": { builder: "Bullpen", start: "2025-10-14" },
  "evplusai": { builder: "EVplusAI", start: "2026-02-26" },
  "preddy-trade": { builder: "Preddy.trade", start: "2025-11-07" },
  "polytrader-app": { builder: "Polytrader.app", start: "2025-12-31" },
  "kiyotaka": { builder: "Kiyotaka", start: "2025-12-09" },
  "polyhelper-io": { builder: "PolyHelper.io", start: "2026-01-01" },
  "gate": { builder: "Gate", start: "2026-02-14" },
  "polycop": { builder: "PolyCop", start: "2025-12-01" },
  "traderline": { builder: "traderline", start: "2025-12-01" },
  "metamask": { builder: "MetaMask", start: "2025-11-10" },
  "wager-up-pilot": { builder: "WagerUpPilot", start: "2026-04-07" },
};

const feesConfigs: Record<string, { builderName: string; builderCode: string; start: string }> = {
  "polygun": { builderName: "Polygun", builderCode: "0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b", start: "2026-04-28" },
  "bullpen": { builderName: "Bullpen", builderCode: "0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de", start: "2026-04-21" },
  "evplusai": { builderName: "EvplusAI", builderCode: "0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415", start: "2026-04-28" },
  "preddy-trade": { builderName: "Preddy.trade", builderCode: "0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef", start: "2026-04-28" },
  "polytrader-app": { builderName: "Polytrader.app", builderCode: "0x6f5dfb79b61e701021143a9426b4188bda94da794068dec5454a0ac2ec82bc64", start: "2026-04-28" },
  "kiyotaka": { builderName: "Kiyotaka", builderCode: "0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f", start: "2026-04-28" },
}

const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = polymarketBuilderExports(config);
}

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = polymarketV2BuilderFeesExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
export const fees = createFactoryExports(feesProtocols);
