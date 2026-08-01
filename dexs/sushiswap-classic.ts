import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

type SushiClassicConfig = {
  factory: string,
  start: string,
}

const sushiClassicConfigs: Record<string, SushiClassicConfig> = {
  // Config copied from factory/uniV2. Keep commented until this adapter is ready to replace the factory export.
  [CHAIN.ETHEREUM]: { factory: "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac", start: "2020-09-05" },
  [CHAIN.AVAX]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-03-10" },
  [CHAIN.FUSE]: { factory: "0x43eA90e2b786728520e4f930d2A71a477BF2737C", start: "2021-09-15" },
  [CHAIN.ARBITRUM]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-04-01" },
  [CHAIN.POLYGON]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-03-01" },
  [CHAIN.BSC]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-03-01" },
  [CHAIN.CORE]: { factory: "0xb45e53277a7e0f1d35f2a77160e91e25507f1763", start: "2023-11-01" },
  [CHAIN.BLAST]: { factory: "0x42fa929fc636e657ac568c0b5cf38e203b67ac2b", start: "2024-03-03" },
  [CHAIN.KATANA]: { factory: "0x72d111b4d6f31b38919ae39779f570b747d6acd9", start: "2025-04-01" },
  [CHAIN.XDAI]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-03-01" },
  [CHAIN.OPTIMISM]: { factory: "0xfbc12984689e5f15626bad03ad60160fe98b303c", start: "2023-10-16" },
  [CHAIN.BASE]: { factory: "0x71524b4f93c58fcbf659783284e38825f0622859", start: "2023-08-15" },
  [CHAIN.SONIC]: { factory: "0xb45e53277a7e0f1d35f2a77160e91e25507f1763", start: "2024-12-13" },
  [CHAIN.CELO]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2021-06-17" },
  [CHAIN.LINEA]: { factory: "0xfbc12984689e5f15626bad03ad60160fe98b303c", start: "2023-10-15" },
  [CHAIN.METIS]: { factory: "0x580ED43F3BBa06555785C81c2957efCCa71f7483", start: "2023-10-15" },
}

const getUniV2LogAdapterConfig = {
  fees: 0.003,
  allowReadPairs: true,
}

async function fetch(options: FetchOptions) {
  const config = sushiClassicConfigs[options.chain];
  if (!config) throw new Error(`No SushiSwap Classic config for ${options.chain}`);

  const results = await getUniV2LogAdapter({ ...config, ...getUniV2LogAdapterConfig })(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.add(results.dailyFees, 'Token Swap Fees')
  dailyRevenue.add(results.dailyFees.clone(1/6), 'Swap Fees To xSUSHI Stakers')
  dailySupplySideRevenue.add(results.dailyFees.clone(5/6), 'Swap Fees To Liquidity Providers')

  return {
    dailyVolume: results.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: sushiClassicConfigs,
  methodology: {
    Fees: "SushiSwap Classic charges a flat 0.3% fee.",
    UserFees: "Users pay a 0.3% fee on each trade.",
    Revenue: "A share of each trade fee goes to xSUSHI stakers.",
    HoldersRevenue: "A share of each trade fee goes to xSUSHI stakers.",
    ProtocolRevenue: "Treasury does not receive SushiSwap Classic swap fees.",
    SupplySideRevenue: "Liquidity providers receive 5/6 of swap fees from trades in their pools.",
  },
  breakdownMethodology: {
    Fees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap Classic pools.",
    },
    UserFees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap Classic pools.",
    },
    Revenue: {
      "Swap Fees To xSUSHI Stakers": "The 1/6 protocol fee share from SushiSwap Classic swaps.",
    },
    HoldersRevenue: {
      "Swap Fees To xSUSHI Stakers": "The 1/6 protocol fee share from SushiSwap Classic swaps.",
    },
    SupplySideRevenue: {
      "Swap Fees To Liquidity Providers": "The 5/6 fee share retained by liquidity providers.",
    },
  },
}
