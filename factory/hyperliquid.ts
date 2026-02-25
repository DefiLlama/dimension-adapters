import { exportBuilderAdapter, exportHIP3DeployerAdapter } from "../helpers/hyperliquid";
import { createFactoryExports } from "./registry";

interface BuilderConfig {
  addresses: string[];
  start?: string;
  deadFrom?: string;
  methodology?: any;
  extraReturnFields?: Record<string, any>;
}

// Builder adapter configs for dexs: protocol name -> config
const builderConfigs: Record<string, BuilderConfig> = {
  "test-alerts-perps": { addresses: ["0x4950994884602d1b6c6d96e4fe30f58205c39395"] },
  "dreamcash": {
    addresses: ["0x4950994884602d1b6c6d96e4fe30f58205c39395"],
    start: "2025-06-12",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "axiom-perps": {
    addresses: ["0x1cc34f6af34653c515b47a83e1de70ba9b0cda1f"],
    start: "2025-06-08",
    methodology: {
      Fees: "Builder Code Fees paid by users for perps.",
      Revenue: "Builder Code Fees collected by Axiom from Hyperliquid Perps.",
      ProtocolRevenue: "Builder Code Fees collected by Axiom from Hyperliquid Perps.",
      HoldersRevenue: "No fees distributed to token holders",
    },
    extraReturnFields: { dailyHoldersRevenue: "0" },
  },
  "metamask-perps": {
    addresses: ["0xe95a5e31904e005066614247d309e00d8ad753aa"],
    start: "2025-10-07",
    methodology: {
      Fees: "Builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "Builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "based-app": {
    addresses: ["0x1924b8561eef20e70ede628a296175d358be80e5"],
    start: "2025-07-08",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "insilico": {
    addresses: ["0x2868fc0d9786a740b491577a43502259efa78a39"],
    start: "2024-10-27",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "phantom-perps": {
    addresses: ["0xb84168cf3be63c6b8dad05ff5d755e97432ff80b"],
    start: "2025-07-08",
    methodology: {
      Fees: "trading fees paid by users for perps in Phantom wallet.",
      Revenue: "Builder Code Fees collected by Phantom from Hyperliquid Perps as Frontend Fees.",
      ProtocolRevenue: "Builder Code Fees collected by Phantom from Hyperliquid Perps.",
    },
  },
  "perpmate": {
    addresses: ["0xE4FEa748ECa48F44b1e042775F0C2363be1A2d80"],
    start: "2025-09-04",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "arena-perps": { addresses: ["0x7056a6bc0a962b6ca37bc5da4c4c5127c81b7af3"], start: "2026-01-23" },
  "minaraai-perps": { addresses: ["0x5a3bc60b0a99a7f4fbf0d15554fa5fe88e7628c2"], start: "2025-12-22" },
  "apexliquid-perps": { addresses: ["0xe1f55f2f25884c2ddc86b6f7efa5f45b2ef04221"], start: "2025-07-06" },
  "coin98-perps": { addresses: ["0x3342ee6851ef0ec3cf42658c2be3b28a905271aa"], start: "2025-09-26" },
  "coinpilot-perps": {
    addresses: ["0xe9935bb291ab3603b4d7862e6f19315f759aa3a4"],
    start: "2025-08-01",
    methodology: {
      Fees: "Trading fees paid by users for perps in CoinPilot Mobile App.",
      Revenue: "Fees collected by CoinPilot from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by CoinPilot from Hyperliquid Perps as Builder Revenue.",
    },
  },
  "echosync-perps": { addresses: ["0x831ad7eb3e600a3ab8df851ce27df8d8dd6b5d9c"], start: "2025-11-07" },
  // "flowbot-perps": { addresses: ["0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36"], start: "2025-11-27" },
  "fomo-perps": { addresses: ["0xb838e4d1c8bcf71fa8e63299d5aa3258c83d6adb"] },
  "gemwallet-perps": {
    addresses: ["0x0d9dab1a248f63b0a48965ba8435e4de7497a3dc"],
    start: "2025-08-01",
    methodology: {
      Fees: "Trading fees paid by users for perps in Gem Wallet.",
      Revenue: "Fees collected by Gem Wallet from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by Gem Wallet from Hyperliquid Perps as Builder Revenue.",
    },
  },
  "gtr-trade-perps": { addresses: ["0x5ef4deeb76f87d979d0ddc8c51f5b4f65d1c972a"], start: "2025-06-17" },
  "hyprearn-perps": { addresses: ["0x70cf605bb180daf00c3e2f1ca3df5bb602664452"], start: "2025-09-01" },
  "katoshi-perps": {
    addresses: ["0x274e3cdb7bdc4805f41a07e3348243ba3e7e5b72"],
    start: "2025-08-01",
    methodology: {
      Fees: "Trading fees paid by users for perps in Katoshi Trading Terminal.",
      Revenue: "Fees collected by Katoshi from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by Katoshi from Hyperliquid Perps as Builder Revenue.",
    },
  },
  "metascalp-perps": {
    addresses: ["0xa9ab442f9dfe752dc74b666c41e7a0498baf8687"],
    start: "2025-09-11",
    methodology: {
      Fees: "Trading fees paid by users for perps in Metascalp Trading Terminal.",
      Revenue: "Fees collected by Metascalp from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by Metascalp from Hyperliquid Perps as Builder Revenue.",
    },
  },
  // "miracletrade": { addresses: ["0x5eb46BFBF7C6004b59D67E56749e89e83c2CaF82"], start: "2025-09-11" },
  "moontrader-perps": { addresses: ["0x38b176c674cd9a3b97a59b0a7045ba26a13783cb"], start: "2025-09-01" },
  "onekey-perps": {
    addresses: ["0x9b12e858da780a96876e3018780cf0d83359b0bb"],
    start: "2025-08-20",
    methodology: {
      Fees: "Trading fees paid by users for perps in OneKey Wallet.",
      Revenue: "Fees collected by OneKey from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by OneKey from Hyperliquid Perps as Builder Revenue.",
    },
  },
  "pear-interface": {
    addresses: ["0xa47d4d99191db54a4829cdf3de2417e527c3b042"],
    start: "2025-07-08",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "rabby-perps": {
    addresses: ["0xad9be64fd7a35d99a138b87cb212baefbcdcf045"],
    start: "2025-08-28",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "ranger-finance-perps": { addresses: ["0xf5bc9107916b91a3ea5966cd2e51655d21b7eb02"], start: "2025-08-12" },
  "senpi-perps": { addresses: ["0x1368f4311db5807f7c7924d736adaeb83e47bafe"], start: "2025-11-10" },
  "splashos-perps": {
    addresses: ["0xe9935bb291ab3603b4d7862e6f19315f759aa3a4"],
    start: "2025-08-01",
    methodology: {
      Fees: "Trading fees paid by users for perps in SplashOS Mobile App.",
      Revenue: "Fees collected by SplashOS from Hyperliquid Perps as Builder Revenue.",
      ProtocolRevenue: "Fees collected by SplashOS from Hyperliquid Perps as Builder Revenue.",
    },
  },
  "superX": {
    addresses: ["0x4ecd58def11dc3cadf7deb09f27da69d5475acb3"],
    start: "2025-04-15",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "supurr-perps": { addresses: ["0x36be02a397e969e010ccbd7333f4169f66b8989f"], start: "2025-09-19" },
  "unigox-perps": { addresses: ["0xf8ead1ecc72dfbb87cdd7bf78450f7cf68d046a3"], start: "2025-09-01" },
  "uxuy-perps": { addresses: ["0x2e266a0f40e9f5bca48f5df1686aab10b1b68ec8"], start: "2025-10-20" },
  "wunder-perps": { addresses: ["0x75982eb8b734b24b653b39e308489a428041f162"], start: "2025-10-19" },
};

// Builder fees configs: protocol name -> config
const builderFeesConfigs: Record<string, BuilderConfig> = {
  "axiom-perps": {
    addresses: ["0x1cc34f6af34653c515b47a83e1de70ba9b0cda1f"],
    start: "2025-06-08",
    methodology: {
      Fees: "Builder Code Fees paid by users for perps.",
      Revenue: "Builder Code Fees collected by Axiom from Hyperliquid Perps.",
      ProtocolRevenue: "Builder Code Fees collected by Axiom from Hyperliquid Perps.",
      HoldersRevenue: "No fees distributed to token holders",
    },
    extraReturnFields: { dailyHoldersRevenue: "0" },
  },
  "based-app": {
    addresses: ["0x1924b8561eef20e70ede628a296175d358be80e5"],
    start: "2025-07-08",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "bullpenfi-perps": {
    addresses: ["0x4c8731897503f86a2643959cbaa1e075e84babb7"],
    start: "2025-03-25",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "dexari": {
    addresses: ["0x7975cafdff839ed5047244ed3a0dd82a89866081"],
    start: "2025-01-28",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "dexly-trade": {
    addresses: ["0x22047776933bC123D0602ed17aaF0D2f5647DF0C"],
    start: "2026-02-01",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  // "dextrabot": {
  //   addresses: ["0x49ae63056b3a0be0b166813ee687309ab653c07c"],
  //   start: "2025-02-16",
  //   methodology: {
  //     Fees: "builder code revenue from Hyperliquid Perps Trades.",
  //     Revenue: "builder code revenue from Hyperliquid Perps Trades.",
  //     ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
  //   },
  // },
  "dreamcash": {
    addresses: ["0x4950994884602d1b6c6d96e4fe30f58205c39395"],
    start: "2025-06-12",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "hyperdash": {
    addresses: ["0xe966a12bf7b93838096e4519a684519ab22df618"],
    start: "2025-01-05",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  // "hypersignals": {
  //   addresses: ["0x8af3545a3988b7A46f96F9F1AE40c0e64Fa493C2"],
  //   start: "2025-07-29",
  //   methodology: {
  //     Fees: "builder code revenue from Hyperliquid Perps Trades.",
  //     Revenue: "builder code revenue from Hyperliquid Perps Trades.",
  //     ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
  //   },
  // },
  "infinex-perps": {
    addresses: ["0xcf56dd84ed85eb4929e0a76a0f2f04049b4ffc1a"],
    start: "2025-08-18",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "insilico": {
    addresses: ["0x2868fc0d9786a740b491577a43502259efa78a39"],
    start: "2024-10-27",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "liminal-perps": {
    addresses: ["0x7e1830b1796b01f2f6a7118d50d4d02491421f32"],
    start: "2025-07-20",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "liquid-perps": {
    addresses: ["0x6d4e7f472e6a491b98cbeed327417e310ae8ce48"],
    start: "2025-06-12",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "lit-trade": {
    addresses: ["0x24a747628494231347f4f6aead2ec14f50bcc8b7"],
    start: "2025-08-01",
    methodology: {
      Fees: "Builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "Builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "lootbase": {
    addresses: ["0x3e0ef9ad4096c30acefbf7a996f4c19edd071286"],
    start: "2025-02-05",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "mass-dot-money": {
    addresses: ["0xf944069b489f1ebff4c3c6a6014d58cbef7c7009"],
    start: "2025-06-23",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "metamask-perps": {
    addresses: ["0xe95a5e31904e005066614247d309e00d8ad753aa"],
    start: "2025-10-07",
    methodology: {
      Fees: "Builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "Builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "moonbot": { addresses: ["0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533"] },
  "okto-wallet": {
    addresses: [
      "0x05984fd37db96dc2a11a09519a8def556e80590b",
      "0x4fe1141b9066f3777f4bd4d4ac9d216173031dc1",
    ],
    start: "2024-10-28",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "perpmate": {
    addresses: ["0xE4FEa748ECa48F44b1e042775F0C2363be1A2d80"],
    start: "2025-09-04",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "phantom-perps": {
    addresses: ["0xb84168cf3be63c6b8dad05ff5d755e97432ff80b"],
    start: "2025-07-08",
    methodology: {
      Fees: "trading fees paid by users for perps in Phantom wallet.",
      Revenue: "Builder Code Fees collected by Phantom from Hyperliquid Perps as Frontend Fees.",
      ProtocolRevenue: "Builder Code Fees collected by Phantom from Hyperliquid Perps.",
    },
  },
  "pvp-trade": {
    addresses: ["0x0cbf655b0d22ae71fba3a674b0e1c0c7e7f975af"],
    start: "2024-10-27",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "rabby-perps": {
    addresses: ["0xad9be64fd7a35d99a138b87cb212baefbcdcf045"],
    start: "2025-08-28",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "rainbow-perps": {
    addresses: ["0x60dc8e3dad2e4e0738e813b9cb09b9c00b5e0fc9"],
    start: "2025-09-15",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "supercexy": {
    addresses: ["0x0000000bfbf4c62c43c2e71ef0093f382bf7a7b4"],
    start: "2025-07-12",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "superstack": {
    addresses: ["0xCDb943570BcB48a6F1d3228d0175598fEA19E87B"],
    start: "2025-10-28",
    methodology: {
      Fees: "Builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "Builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "superx": {
    addresses: ["0x4ecd58def11dc3cadf7deb09f27da69d5475acb3"],
    start: "2025-04-15",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "wallet-v": {
    addresses: ["0x68c68ba58f50bdbe5c4a6faf0186b140eab2b764"],
    start: "2025-06-11",
    methodology: {
      Fees: "builder code revenue from Hyperliquid Perps Trades.",
      Revenue: "builder code revenue from Hyperliquid Perps Trades.",
      ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades.",
    },
  },
  "xtrade-protocol-perps": {
    addresses: ["0xa58d3d31f09d75bd92ae2ef277e785b2ebb83b77"],
    start: "2025-05-05",
    methodology: {
      Fees: "0.01% per trade, plus separate fees from Hyperliquid.",
      Revenue: "Portion of fees collected by XTrade",
      ProtocolRevenue: "Portion of fees collected by XTrade",
    },
  },
};

// HIP3 deployer dex configs: protocol name -> { dexId, start, methodology }
const hip3DexConfigs: Record<string, { dexId: string; start: string; methodologyName: string }> = {
  "dreamcash-markets": { dexId: "cash", start: "2026-01-20", methodologyName: "Dreamcash" },
  "felix-perp": { dexId: "flx", start: "2025-11-13", methodologyName: "Felix protocol" },
  "hyena": { dexId: "hyna", start: "2025-12-01", methodologyName: "Based and Ethena teams" },
  // "kinetiq-markets": { dexId: "km", start: "2025-12-16", methodologyName: "Kinetiq Markets" },
  "tradexyz": { dexId: "xyz", start: "2025-11-01", methodologyName: "Trade.xyz" },
  "ventuals": { dexId: "vntl", start: "2025-11-13", methodologyName: "Ventuals" },
};

// HIP3 deployer OI configs: protocol name -> dexId
const hip3OiConfigs: Record<string, string> = {
  "dreamcash-markets-oi": "cash",
  "felix-perp-oi": "flx",
  "hyena-oi": "hyna",
  // "kinetiq-markets-oi": "km",
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
  dexsProtocols[name] = exportBuilderAdapter(config.addresses, {
    start: config.start,
    deadFrom: config.deadFrom,
    methodology: config.methodology,
    extraReturnFields: config.extraReturnFields,
  });
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
  feesProtocols[name] = exportBuilderAdapter(config.addresses, {
    start: config.start,
    deadFrom: config.deadFrom,
    methodology: config.methodology,
    extraReturnFields: config.extraReturnFields,
  });
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
