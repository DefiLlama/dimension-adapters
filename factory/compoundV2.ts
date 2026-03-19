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
    chains: { [CHAIN.AVAX]: { comptroller: "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4", start: '2021-08-18' } },
    options: { holdersRevenueRatio: 0, protocolRevenueRatio: 1 },
  },
  "canto-lending": {
    chains: { [CHAIN.CANTO]: { comptroller: "0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C", start: '2022-08-18' } },
    options: { protocolRevenueRatio: 1 },
  },
  "capyfi": {
    chains: {
      [CHAIN.ETHEREUM]: { comptroller: "0x0b9af1fd73885aD52680A1aeAa7A3f17AC702afA", start: '2025-05-20' },
      [CHAIN.WC]: { comptroller: "0x589d63300976759a0fc74ea6fA7D951f581252D7", start: '2025-07-23' },
    },
    options: { protocolRevenueRatio: 1, blacklists: ["0xbaa6bc4e24686d710b9318b49b0bb16ec7c46bfa"] },
  },
  "deepr-finance": {
    chains: {
      [CHAIN.SHIMMER_EVM]: { comptroller: "0xF7E452A8685D57083Edf4e4CC8064EcDcF71D7B7", start: '2024-01-09' },
      [CHAIN.IOTAEVM]: { comptroller: "0xee07121d97FDEA35675e02017837a7a43aeDa48F", start: '2024-08-22' },
    },
    options: { holdersRevenueRatio: 1 },
  },
  "elara": {
    chains: { [CHAIN.ZIRCUIT]: { comptroller: "0x695aCEf58D1a10Cf13CBb4bbB2dfB7eDDd89B296", start: '2024-11-20' } },
    options: { protocolRevenueRatio: 1 },
  },
  "fluxfinance": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0x95Af143a021DF745bc78e845b54591C53a8B3A51", start: '2023-02-02' } },
    options: { protocolRevenueRatio: 1 },
  },
  "hover": {
    chains: { [CHAIN.KAVA]: { comptroller: "0x3A4Ec955a18eF6eB33025599505E7d404a4d59eC", start: '2023-11-24' } },
  },
  "machfi": {
    chains: { [CHAIN.SONIC]: { comptroller: "0x646F91AbD5Ab94B76d1F9C5D9490A2f6DDf25730", start: '2025-01-01' } },
    options: { protocolRevenueRatio: 1 },
  },
  "mendi-finance": {
    chains: { [CHAIN.LINEA]: { comptroller: "0x1b4d3b0421dDc1eB216D230Bc01527422Fb93103", start: '2023-08-18' } },
    options: { holdersRevenueRatio: 1, protocolRevenueRatio: 0 },
  },
  "morpho-compound": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0x930f1b46e1d081ec1524efd95752be3ece51ef67", start: '2023-07-01' } },
  },
  "qie-lend": {
    chains: { [CHAIN.QIEV3]: { comptroller: "0x69a31E3D361C69B37463aa67Ef93067dC760fBD4" } },
  },
  "strike": {
    chains: { [CHAIN.ETHEREUM]: { comptroller: "0xe2e17b2CBbf48211FA7eB8A875360e5e39bA2602", start: '2021-03-30' } },
    options: { useExchangeRate: true, blacklists: ["0xc13fdf3af7ec87dca256d9c11ff96405d360f522", "0x1ebfd36223079dc79fefc62260db9e25f3f5e2c7"], protocolRevenueRatio: 1 },
  },
  "sumer": {
    chains: {
      [CHAIN.METER]: { comptroller: "0xcB4cdDA50C1B6B0E33F544c98420722093B7Aa88", start: '2023-11-13' },
      [CHAIN.BASE]: { comptroller: "0x611375907733D9576907E125Fb29704712F0BAfA", start: '2024-01-09' },
      [CHAIN.ARBITRUM]: { comptroller: "0xBfb69860C91A22A2287df1Ff3Cdf0476c5aab24A", start: '2023-12-04' },
      [CHAIN.ETHEREUM]: { comptroller: "0x60A4570bE892fb41280eDFE9DB75e1a62C70456F", start: '2024-07-07' },
      [CHAIN.ZKLINK]: { comptroller: "0xe6099D924efEf37845867D45E3362731EaF8A98D", start: '2024-08-12' },
      [CHAIN.BSQUARED]: { comptroller: "0xdD9C863197df28f47721107f94eb031b548B5e48", start: '2024-10-18' },
      [CHAIN.CORE]: { comptroller: "0x7f5a7aE2688A7ba6a9B36141335044c058a08b3E", start: '2024-12-13' },
      [CHAIN.BSC]: { comptroller: "0x15B5220024c3242F7D61177D6ff715cfac4909eD", start: '2024-08-31' },
      [CHAIN.BERACHAIN]: { comptroller: "0x16C7d1F9EA48F7DE5E8bc3165A04E8340Da574fA", start: '2025-02-08' },
      [CHAIN.HEMI]: { comptroller: "0xB2fF02eEF85DC4eaE95Ab32AA887E0cC69DF8d8E", start: '2025-03-06' },
    },
    options: { protocolRevenueratio: 1 },
  },
  "takara-lend": {
    chains: { [CHAIN.SEI]: { comptroller: "0x71034bf5eC0FAd7aEE81a213403c8892F3d8CAeE", start: '2025-02-13' } },
    options: { useExchangeRate: true, protocolRevenueRatio: 1 },
  },
  "traderjoe-lend": {
    chains: { [CHAIN.AVAX]: { comptroller: "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC", start: '2021-10-11' } },
    options: { protocolRevenueRatio: 1 },
  },
  "venus-finance": {
    chains: {
      [CHAIN.BSC]: { comptroller: "0xfD36E2c2a6789Db23113685031d7F16329158384", start: '2020-11-23' },
      [CHAIN.ETHEREUM]: { comptroller: "0x687a01ecF6d3907658f7A7c714749fAC32336D1B", start: '2024-01-10' },
      [CHAIN.OP_BNB]: { comptroller: "0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd", start: '2024-02-16' },
      [CHAIN.ARBITRUM]: { comptroller: "0x317c1A5739F39046E20b08ac9BeEa3f10fD43326", start: '2024-05-30' },
      [CHAIN.ERA]: { comptroller: "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1", start: '2024-09-06' },
      [CHAIN.BASE]: { comptroller: "0x0C7973F9598AA62f9e03B94E92C967fD5437426C", start: '2024-12-07' },
      [CHAIN.OPTIMISM]: { comptroller: "0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC", start: '2024-10-01' },
      [CHAIN.UNICHAIN]: { comptroller: "0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe", start: '2025-02-08' },
    },
    options: { protocolRevenueRatio: 0.6, holdersRevenueRatio: 0.4 },
  },
  "mare-finance-v2": {
    chains: { [CHAIN.KAVA]: { comptroller: "0xFcD7D41D5cfF03C7f6D573c9732B0506C72f5C72", start: '2023-07-13' } },
  },
  "quantus": {
    chains: {
      [CHAIN.MONAD]: { comptroller: '0xFc57bF0733e5e65d8549fc2922919Cfb97e62D5f', start: '2025-11-26' },
      [CHAIN.MEGAETH]: { comptroller: '0x1F1416EbbeAb7a13fC5B6111A1E77696Be600413', start: '2026-02-08' },
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
    ethereum: { comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', start: '2019-05-07' },
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
