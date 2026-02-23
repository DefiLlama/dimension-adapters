import { exportBuilderAdapter, exportHIP3DeployerAdapter } from "../helpers/hyperliquid";
import { createFactoryExports } from "./registry";

// Builder adapter configs: protocol name -> { addresses, start? }
const builderConfigs: Record<string, { addresses: string[]; start?: string }> = {
  "apexliquid-perps": { addresses: ["0xe1f55f2f25884c2ddc86b6f7efa5f45b2ef04221"], start: "2025-07-06" },
  "coin98-perps": { addresses: ["0x3342ee6851ef0ec3cf42658c2be3b28a905271aa"], start: "2025-09-26" },
  "echosync-perps": { addresses: ["0x831ad7eb3e600a3ab8df851ce27df8d8dd6b5d9c"], start: "2025-11-07" },
  "flowbot-perps": { addresses: ["0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36"], start: "2025-11-27" },
  "fomo-perps": { addresses: ["0xb838e4d1c8bcf71fa8e63299d5aa3258c83d6adb"] },
  "gtr-trade-perps": { addresses: ["0x5ef4deeb76f87d979d0ddc8c51f5b4f65d1c972a"], start: "2025-06-17" },
  "hyprearn-perps": { addresses: ["0x70cf605bb180daf00c3e2f1ca3df5bb602664452"], start: "2025-09-01" },
  "miracletrade": { addresses: ["0x5eb46BFBF7C6004b59D67E56749e89e83c2CaF82"], start: "2025-09-11" },
  "moontrader-perps": { addresses: ["0x38b176c674cd9a3b97a59b0a7045ba26a13783cb"], start: "2025-09-01" },
  "ranger-finance-perps": { addresses: ["0xf5bc9107916b91a3ea5966cd2e51655d21b7eb02"], start: "2025-08-12" },
  "senpi-perps": { addresses: ["0x1368f4311db5807f7c7924d736adaeb83e47bafe"], start: "2025-11-10" },
  "supurr-perps": { addresses: ["0x36be02a397e969e010ccbd7333f4169f66b8989f"], start: "2025-09-19" },
  "unigox-perps": { addresses: ["0xf8ead1ecc72dfbb87cdd7bf78450f7cf68d046a3"], start: "2025-09-01" },
  "uxuy-perps": { addresses: ["0x2e266a0f40e9f5bca48f5df1686aab10b1b68ec8"], start: "2025-10-20" },
  "wunder-perps": { addresses: ["0x75982eb8b734b24b653b39e308489a428041f162"], start: "2025-10-19" },
};

// Builder fees configs (separate adapter type)
const builderFeesConfigs: Record<string, { addresses: string[]; start?: string }> = {
  "moonbot": { addresses: ["0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533"] },
};

// HIP3 deployer dex configs: protocol name -> { dexId, start, methodology }
const hip3DexConfigs: Record<string, { dexId: string; start: string; methodologyName: string }> = {
  "dreamcash-markets": { dexId: "cash", start: "2026-01-20", methodologyName: "Dreamcash" },
  "felix-perp": { dexId: "flx", start: "2025-11-13", methodologyName: "Felix protocol" },
  "hyena": { dexId: "hyna", start: "2025-12-01", methodologyName: "Based and Ethena teams" },
  "kinetiq-markets": { dexId: "km", start: "2025-12-16", methodologyName: "Kinetiq Markets" },
  "tradexyz": { dexId: "xyz", start: "2025-11-01", methodologyName: "Trade.xyz" },
  "ventuals": { dexId: "vntl", start: "2025-11-13", methodologyName: "Ventuals" },
};

// HIP3 deployer OI configs: protocol name -> dexId
const hip3OiConfigs: Record<string, string> = {
  "dreamcash-markets-oi": "cash",
  "felix-perp-oi": "flx",
  "hyena-oi": "hyna",
  "kinetiq-markets-oi": "km",
  "tradexyz-oi": "xyz",
  "ventuals-oi": "vntl",
};

function hip3Methodology(name: string) {
  return {
    Fees: `Trading fees paid by users on Hyperliquid markets deployed by ${name}.`,
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.',
  };
}

// Build dexs protocols (builder + HIP3 dex)
const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(builderConfigs)) {
  dexsProtocols[name] = exportBuilderAdapter(config.addresses, { start: config.start });
}
for (const [name, config] of Object.entries(hip3DexConfigs)) {
  dexsProtocols[name] = exportHIP3DeployerAdapter(config.dexId, {
    type: "dexs",
    start: config.start,
    methodology: hip3Methodology(config.methodologyName),
  });
}

// Build fees protocols (builder fees)
const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(builderFeesConfigs)) {
  feesProtocols[name] = exportBuilderAdapter(config.addresses, { start: config.start });
}

// Build OI protocols (HIP3 OI)
const oiProtocols: Record<string, any> = {};
for (const [name, dexId] of Object.entries(hip3OiConfigs)) {
  oiProtocols[name] = exportHIP3DeployerAdapter(dexId, { type: "oi" });
}

// Default export: dexs (builder dexs + HIP3 dexs)
export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
// Named export: fees (builder fees)
export const fees = createFactoryExports(feesProtocols);
// Named export: oi (HIP3 open interest)
export const oi = createFactoryExports(oiProtocols);
