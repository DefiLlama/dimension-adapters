import { duneSolanaDexTrades } from "../helpers/duneSolanaDex";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, string> = {
    "scorch": "2025-12-10",
    "whalestreet": "2025-11-20",
    "jupiterz": "2024-10-10"
}

const dexsProtocols: Record<string, any> = {};

for (const [name, start] of Object.entries(dexsConfigs)) {
    dexsProtocols[name] = duneSolanaDexTrades(name, start);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);