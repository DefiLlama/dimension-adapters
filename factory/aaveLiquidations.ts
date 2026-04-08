import { aaveProtocolConfigs } from "../helpers/aave";
import { aaveLiquidationsExport } from "../helpers/aave/liquidations";
import { chainConfig as aaveV3ChainConfig } from "../fees/aave-v3";
import { chainConfig as sparkChainConfig } from "../fees/spark";
import { createFactoryExports } from "./registry";

type LiquidationConfig = Record<string, { pools: string[]; start?: string }>;

// create liquidation configs from aave fee configs so new protocols added to fee tracking are picked up
function toLiquidationConfig(
  feeConfig: Record<string, { start?: any; pools: Array<{ lendingPoolProxy: string; version: number; ignoreLiquidation?: boolean }> }>,
): LiquidationConfig | null {
  const result: LiquidationConfig = {};
  for (const [chain, { pools, start }] of Object.entries(feeConfig)) {
    // V1 uses a different LiquidationCall event (skips for now)
    const addresses = pools
      .filter((p) => !p.ignoreLiquidation && p.version >= 2)
      .map((p) => p.lendingPoolProxy);
    if (addresses.length > 0) {
      result[chain] = { pools: addresses, start: start ? String(start) : undefined };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// get configs from helpers/aave fee configs
const configs: Record<string, LiquidationConfig> = {};
for (const [name, { config }] of Object.entries(aaveProtocolConfigs)) {
  const liquidationConfig = toLiquidationConfig(config as any);
  if (liquidationConfig) {
    configs[name] = liquidationConfig;
  }
}

// get aave-v3 fee config
configs["aave-v3"] = {};
for (const [chain, { pools, start }] of Object.entries(aaveV3ChainConfig)) {
  configs["aave-v3"][chain] = {
    pools: (pools as Array<{ lendingPoolProxy: string }>).map((p) => p.lendingPoolProxy),
    start,
  };
}

// get spark fee config
configs["spark"] = {};
for (const [chain, { pools, start }] of Object.entries(sparkChainConfig)) {
  configs["spark"][chain] = {
    pools: pools.map((p) => p.lendingPoolProxy),
    start,
  };
}

const protocols: Record<string, any> = {};
for (const [name, config] of Object.entries(configs)) {
  protocols[name] = aaveLiquidationsExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);