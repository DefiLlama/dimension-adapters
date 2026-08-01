import { duneSolanaDexTrades } from "../helpers/duneSolanaDex";
import { createFactoryExports } from "./registry";

const dexsConfigs: Record<string, { project: string, start: string }> = {
    "scorch": {
        "project": "scorch",
        "start": "2025-12-10",
    },
    "whalestreet": {
        "project": "whalestreet",
        "start": "2025-11-20",
    },
    "jupiterz": {
        "project": "jupiterz",
        "start": "2024-10-10",
    },
    "aquifer": {
        "project": "aquifer",
        "start": "2025-09-07",
    },
    "goonfi": {
        "project": "goonfi",
        "start": "2025-05-22",
    },
    "launchlab": {
        "project": "raydium_launchlab",
        "start": "2025-04-15",
    },
    "zerofi": {
        "project": "zerofi",
        "start": "2024-12-12",
    },
}

const dexsProtocols: Record<string, any> = {};

for (const [name, { project, start }] of Object.entries(dexsConfigs)) {
    dexsProtocols[name] = duneSolanaDexTrades(project, start);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);