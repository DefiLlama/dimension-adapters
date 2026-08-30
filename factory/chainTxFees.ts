import { fetchChainTransactionFeesExport } from "../helpers/getChainFees";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const alliumFeesConfigs: Record<string, { chain: CHAIN; start: string }> = {
  "berachain": { chain: CHAIN.BERACHAIN, start: "2025-02-05" },
  "core": { chain: CHAIN.CORE, start: "2023-04-19" },
  "fraxtal": { chain: CHAIN.FRAXTAL, start: "2025-02-05" },
  "linea": { chain: CHAIN.LINEA, start: "2025-02-05" },
  "ronin": { chain: CHAIN.RONIN, start: "2025-02-05" },
  "sonic": { chain: CHAIN.SONIC, start: "2025-02-05" },
  "xlayer": { chain: CHAIN.XLAYER, start: "2024-03-30" },
};

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(alliumFeesConfigs)) {
  feesProtocols[name] = fetchChainTransactionFeesExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
