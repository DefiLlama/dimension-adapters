import { createEvmChainFeesAdapter, EVM_CHAIN_METRIC_CONFIGS } from "../helpers/evmChainFees";
import { fetchChainTransactionFeesExport } from "../helpers/getChainFees";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const alliumFeesConfigs: Record<string, { chain: CHAIN; start: string }> = {
  "berachain": { chain: CHAIN.BERACHAIN, start: "2025-02-05" },
  "fraxtal": { chain: CHAIN.FRAXTAL, start: "2025-02-05" },
  "linea": { chain: CHAIN.LINEA, start: "2025-02-05" },
  "ronin": { chain: CHAIN.RONIN, start: "2025-02-05" },
  "sonic": { chain: CHAIN.SONIC, start: "2025-02-05" },
};

const rpcFeesConfigKeys = ["core", "kava"] as const;

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(alliumFeesConfigs)) {
  feesProtocols[name] = fetchChainTransactionFeesExport(config);
}
for (const name of rpcFeesConfigKeys) {
  feesProtocols[name] = createEvmChainFeesAdapter(EVM_CHAIN_METRIC_CONFIGS[name]);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
