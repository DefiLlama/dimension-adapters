import { CHAIN } from "../helpers/chains";
import { BaseAdapter, SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const FactoryConfigs: Record<string, { factory: string, start?: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: '0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac',
    start: '2020-09-05',
  },
  [CHAIN.AVAX]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-03-10',
  },
  [CHAIN.FUSE]: {
    factory: '0x43eA90e2b786728520e4f930d2A71a477BF2737C',
    start: '2021-09-15',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-04-01',
  },
  [CHAIN.POLYGON]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-03-01',
  },
  [CHAIN.BSC]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-03-01',
  },
  [CHAIN.CORE]: {
    factory: '0xb45e53277a7e0f1d35f2a77160e91e25507f1763',
    start: '2023-11-01',
  },
  [CHAIN.BLAST]: {
    factory: '0x42fa929fc636e657ac568c0b5cf38e203b67ac2b',
    start: '2024-03-03',
  },
  [CHAIN.KATANA]: {
    factory: '0x72d111b4d6f31b38919ae39779f570b747d6acd9',
    start: '2025-04-01',
  },
  [CHAIN.XDAI]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-03-01',
  },
  [CHAIN.OPTIMISM]: {
    factory: '0xfbc12984689e5f15626bad03ad60160fe98b303c',
    start: '2023-10-16',
  },
  [CHAIN.BASE]: {
    factory: '0x71524b4f93c58fcbf659783284e38825f0622859',
    start: '2023-08-15',
  },
  [CHAIN.SONIC]: {
    factory: '0xb45e53277a7e0f1d35f2a77160e91e25507f1763',
    start: '2024-12-13',
  },
  [CHAIN.CELO]: {
    factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4',
    start: '2021-06-17',
  },
  [CHAIN.LINEA]: {
    factory: '0xfbc12984689e5f15626bad03ad60160fe98b303c',
    start: '2023-10-15',
  },
  [CHAIN.METIS]: {
    factory: '0x580ED43F3BBa06555785C81c2957efCCa71f7483',
    start: '2023-10-15',
  },
  
  // [CHAIN.HARMONY]: {
  //   factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  // },
  // [CHAIN.FANTOM]: {
  //   factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
  // },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "SushiSwap charges a flat 0.3% fee",
    UserFees: "Users pay a 0.3% fee on each trade",
    Revenue: "A 0.05% of each trade goes to treasury",
    HoldersRevenue: "Share of swap fee goes to xSUSHI stakers.",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get 5/6 of all trades in their pools"
  },
  adapter: {},
}

const getUniV2LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 1 / 6,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 1 / 6,
  allowReadPairs: true,
}

for (const [chain, config] of Object.entries(FactoryConfigs)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: getUniV2LogAdapter({ factory: config.factory, ...getUniV2LogAdapterConfig })
  }
}

export default adapter;
