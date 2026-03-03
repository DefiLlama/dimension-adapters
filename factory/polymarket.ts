import { polymarketBuilderExports } from "../helpers/polymarket";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, { builder: string; start: string }> = {
  "based-predict": { builder: "Based", start: "2025-11-18" },
  "betmoar-fun": { builder: "betmoar", start: "2025-10-17" },
  "flowbot-prediction": { builder: "FlowBot", start: "2025-12-31" },
  "polycule": { builder: "Polycule", start: "2025-11-03" },
  "polytraderpro": { builder: "polytraderpro", start: "2025-10-22" },
  "stand-trade": { builder: "standtrade", start: "2025-10-10" },
};

const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = polymarketBuilderExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
