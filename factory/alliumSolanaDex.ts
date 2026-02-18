import { alliumSolanaDexExport } from "../helpers/alliumDex";
import { createFactoryExports } from "./registry";

// [alliumDexName, dexId, start]
const dexsConfigs: Record<string, [string, string, string]> = {
  "cropper-clmm": ["cropper", "cropper-whirlpool", "2024-04-24"],
  "fluxbeam": ["fluxbeam", "fluxbeam", "2023-05-29"],
  "obric-v2": ["obric", "obric-v2", "2024-06-04"],
  "openbook": ["openbook", "openbook", "2022-01-27"],
  "solfi": ["solfi", "solfi", "2024-10-29"],
};

const dexsProtocols: Record<string, any> = {};
for (const [name, [alliumDexName, dexId, start]] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = alliumSolanaDexExport(alliumDexName, dexId, start);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
