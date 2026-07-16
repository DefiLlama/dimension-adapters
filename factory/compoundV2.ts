import { compoundV2Export, compoundV2LiquidationsExport } from "../helpers/compoundV2";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

type ChainConfig = {
  comptroller: string;
  start?: string;
};

type Config = {
  chains: Record<string, ChainConfig>;
  options?: Record<string, any>;
};

const configs: Record<string, Config> = {
  "benqi-lending": {
    chains: { [CHAIN.AVAX]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2021-08-18' } },
    options: { holdersRevenueRatio: 0, protocolRevenueRatio: 1 },
  },
  "canto-lending": {
    chains: { [CHAIN.CANTO]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2022-08-18' } },
    options: { protocolRevenueRatio: 1 },
  },
  "capyfi": {
    chains: {
      [CHAIN.ETHEREUM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2025-05-20' },
      [CHAIN.WC]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2025-07-23' },
    },
    options: { protocolRevenueRatio: 1, blacklists: ["0x46531ea0E7cec64b14181d45F8C6798a1cE45da1"] },
  },
  "deepr-finance": {
    chains: {
      [CHAIN.SHIMMER_EVM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-01-09' },
      [CHAIN.IOTAEVM]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-08-22' },
    },
    options: { holdersRevenueRatio: 1 },
  },
  "elara": {
    chains: { [CHAIN.ZIRCUIT]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-11-20' } },
    options: { protocolRevenueRatio: 1 },
  },
  "fluxfinance": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2023-02-02' } },
    options: { protocolRevenueRatio: 1 },
  },
  "hover": {
    chains: { [CHAIN.KAVA]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2023-11-24' } },
  },
  "machfi": {
    chains: { [CHAIN.SONIC]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2025-01-01' } },
    options: { protocolRevenueRatio: 1 },
  },
  "mendi-finance": {
    chains: { [CHAIN.LINEA]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2023-08-18' } },
    options: { holdersRevenueRatio: 1, protocolRevenueRatio: 0 },
  },
  "morpho-compound": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2023-07-01' } },
  },
  "qie-lend": {
    chains: { [CHAIN.QIEV3]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE" } },
  },
  "strike": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2021-03-30' } },
    options: { useExchangeRate: true, blacklists: ["0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1"], protocolRevenueRatio: 1 },
  },
  "sumer": {
    chains: {
      [CHAIN.METER]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2023-11-13' },
      [CHAIN.BASE]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-01-09' },
      [CHAIN.ARBITRUM]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2023-12-04' },
      [CHAIN.ETHEREUM]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-07-07' },
      [CHAIN.ZKLINK]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-08-12' },
      [CHAIN.BSQUARED]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-10-18' },
      [CHAIN.CORE]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-12-13' },
      [CHAIN.BSC]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-08-31' },
      [CHAIN.BERACHAIN]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2025-02-08' },
      [CHAIN.HEMI]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2025-03-06' },
      [CHAIN.MONAD]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2025-10-29' },
    },
    options: { protocolRevenueRatio: 1 },
  },
  "takara-lend": {
    chains: { [CHAIN.SEI]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2025-02-13' } },
    options: { useExchangeRate: true, protocolRevenueRatio: 1 },
  },
  "traderjoe-lend": {
    chains: { [CHAIN.AVAX]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2021-10-11' } },
    options: { protocolRevenueRatio: 1 },
  },
//   "venus-finance": {
//     chains: {
//       [CHAIN.BSC]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2020-11-23' },
//       [CHAIN.ETHEREUM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-01-10' },
//       [CHAIN.OP_BNB]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-02-16' },
//       [CHAIN.ARBITRUM]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-05-30' },
//       [CHAIN.ERA]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2024-09-06' },
//       [CHAIN.BASE]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-12-07' },
//       [CHAIN.OPTIMISM]: { comptroller: "0x3211d27a1A1B8E40C7974F6951935303e6e56DBE", start: '2024-10-01' },
//       [CHAIN.UNICHAIN]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2025-02-08' },
//     },
//     options: { protocolRevenueRatio: 0.6, holdersRevenueRatio: 0.4 },
//   },
  "mare-finance-v2": {
    chains: { [CHAIN.KAVA]: { comptroller: "0x46531ea0E7cec64b14181d45F8C6798a1cE45da1", start: '2023-07-13' } },
  },
  "quantus": {
    chains: {
      [CHAIN.MONAD]: { comptroller: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1', start: '2025-11-26' },
      [CHAIN.MEGAETH]: { comptroller: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE', start: '2026-02-08' },
    },
  },
  'xpert': {
    chains: {
      [CHAIN.INK]: { comptroller: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1', start: '2026-03-17' },
    },
  },
};


const feesProtocols: Record<string, any> = {};
for (const [name, { chains, options }] of Object.entries(configs)) {
  const comptrollers: Record<string, string> = {};
  for (const [chain, { comptroller }] of Object.entries(chains)) {
    comptrollers[chain] = comptroller;
  }
  feesProtocols[name] = compoundV2Export(comptrollers, options);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);

// Liquidations
type LiquidationConfig = Record<string, { comptroller: string; start?: string }>;

const liquidationConfigs: Record<string, LiquidationConfig> = {
  "compound-v2": {
    ethereum: { comptroller: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE', start: '2019-05-07' },
  },
};

for (const [name, { chains }] of Object.entries(configs)) {
  const config: LiquidationConfig = {};
  for (const [chain, { comptroller, start }] of Object.entries(chains)) {
    config[chain] = { comptroller, start };
  }
  if (Object.keys(config).length > 0) {
    liquidationConfigs[name] = config;
  }
}

const liquidationProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(liquidationConfigs)) {
  liquidationProtocols[name] = compoundV2LiquidationsExport(config);
}

export const liquidations = createFactoryExports(liquidationProtocols);
