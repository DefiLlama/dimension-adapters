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
};

const feesConfigs: Record<string, { builderName: string; builderCode: string; start: string }> = {
  "polygun": { builderName: "Polygun", builderCode: "0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b", start: "2026-04-28" },
  "bullpen": { builderName: "Bullpen", builderCode: "0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de", start: "2026-04-21" },
  "evplusai": { builderName: "EvplusAI", builderCode: "0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415", start: "2026-04-28" },
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
