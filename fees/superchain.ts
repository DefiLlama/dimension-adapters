import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addGasTokensReceived, evmReceivedGasAndTokens, getETHReceived } from "../helpers/token"

// https://github.com/ethereum-optimism/op-analytics/blob/main/op_collective_economics/opcollective_feesplit/inputs/op_collective_feesplit_config.csv
// https://github.com/ethereum-optimism/op-analytics/blob/main/src/op_analytics/configs/revshare_to_addresses.yaml

const revenueToAddresses: any = {
  [CHAIN.BASE]: ['0x9c3631dDE5c8316bE5B7554B0CcD2631C15a9A05'],
  [CHAIN.ETHEREUM]: [
    '0xa3d596eafab6b13ab18d40fae1a962700c84adea',
    '0xC2eC5Dd60CBD5242b8cdeB9d0d37Ff6024584631',
    '0x391716d440C151C42cdf1C95C1d83A5427Bca52C',
    '0xFFdbf6D72fAb356385476369f21064a8e81135d0',
  ],
  [CHAIN.UNICHAIN]: ['0x4300C0D3C0D3C0D3C0d3C0d3c0d3C0d3C0d30002'],
  [CHAIN.SONEIUM]: ['0x16A27462B4D61BDD72CbBabd3E43e11791F7A28c']
}

// Revenue source addresses - only count revenue from these addresses
const revenueFromAddresses: any = {
  [CHAIN.BASE]: [
    '0x09C7bAD99688a55a2e83644BFAed09e62bDcCcBA', // Base Fee Disburser Proxy
    '0x45969D00739d518f0Dde41920B67cE30395135A0'  // Base Fee Disburser Implementation
  ],
  [CHAIN.ETHEREUM]: [
    '0xe900b3Edc1BA0430CFa9a204A1027B90825ac951', // Zora Disburser
    '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // OPM L1 Standard Bridge
    '0xed4811010a86f7c39134fbc20206d906ad1176b6', // Mode Disburser
    '0x13f37e6b638ca83e7090bb3722b3ae04bf884019', // Conduit Disburser 1
    '0x4a4962275DF8C60a80d3a25faEc5AA7De116A746', // Conduit Disburser 3
    '0x793e01dCf6F9759Bf26dd7869b03129e64217537', // Conduit Disburser - Derive
    '0x09315fc454919a37d02d320272fc23a0653f67f9', // Conduit Disburser 4
    '0xBeA2Bc852a160B8547273660E22F4F08C2fa9Bbb', // Gelato Disburser
    '0x83AF9DD63534BF02921c8bE11f7428Ac70B05A1c', // AltLayer Disburser
    '0x7B60C79860ab5DB0368751210Ff29784d3DC18bF', // Lattice Disburser (Redstone)
    '0xe945D527De9c5121EdA9cF48e23CDF691894D4c0', // SwanChain Disburser
    '0x9d89Bca142498FE047bD3E169De8eD028AFaB07F', // Lightscale Disburser (Kroma)
    '0xb2aa0c2c4fd6bfcbf699d4c787cd6cc0dc461a9d', // Alchemy Disburser - World
    '0xee1af3f99af8c5b93512fbe2a3f0dd5568ce087f', // Alchemy Disburser - Shape
    '0x641af675C39E56E5611686Ae07921AFb7d5C1f39', // Soneium Disburser
    '0xF07b3169ffF67A8AECdBb18d9761AEeE34591112', // Soneium Disburser
    '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0'  // Ink Disburser
  ],
  [CHAIN.UNICHAIN]: ['0x4300c0D3c0d3c0d3c0d3C0D3c0d3c0d30001'], // Unichain Disburser
  [CHAIN.SONEIUM]: [
    '0x641af675C39E56E5611686Ae07921AFb7d5C1f39', // Soneium Disburser
    '0xF07b3169ffF67A8AECdBb18d9761AEeE34591112'  // Soneium Disburser
  ]
}

// OP-owned addresses to filter out from revenue calculation
const opOwnedFilterOut: any = {
  [CHAIN.ETHEREUM]: [
    '0x3fdf3c4bf8783bb94295b9219df74a648f397360', // OPM Address
    '0xbd02c51150a4Ab6Ce97B9de2025644594F3E75B8', // OPM Funder
    '0x6887246668a3b87f54deb3b94ba47a6f63f32985', // OPM Batcher
    '0x473300df21d047806a082244b417f96b32f13a33', // OPM Proposer
    '0x6b7c001f4af36a576baba2af3b5251fc326ab09a', // OP Internal
    '0xfd836086c3d607a2ec20337c7d27c09efe656553', // OP Internal
    '0xfd7d4de366850c08ee2cba32d851385a3071ec8d', // OP Internal
    '0xbc07f994bd3d83cddd732bc50b57a810036ddf30', // OP Unknown?
    '0x3cb3dd22128ec657a52dcc9a347838b4f26b142e', // OP Unknown?
    '0xFDD2cC11857D3d2c732Bb3Edb9b7895e49132883'  // OP Unknown?
  ]
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const logs = await options.getLogs({
    targets: revenueToAddresses[options.chain],
    eventAbi: 'event SafeReceived (address indexed sender, uint256 value)',
  })
  const logs2 = await options.getLogs({
    targets: revenueToAddresses[options.chain],
    eventAbi: 'event Deposited (address from, uint256 value, bytes data)',
  })
  
  const dailyFees = options.createBalances()
  
  const allowedFromAddresses = revenueFromAddresses[options.chain]?.map((addr: string) => addr.toLowerCase()) || []
  const excludedAddresses = opOwnedFilterOut[options.chain]?.map((addr: string) => addr.toLowerCase()) || []
  // Process SafeReceived events
  for (const log of logs) {
    if (allowedFromAddresses.includes(log.sender.toLowerCase()) && 
        !excludedAddresses.includes(log.sender.toLowerCase())) {
      dailyFees.addGasToken(log.value)
    }
  }
  
  // Process Deposited events
  for (const log of logs2) {
    if (allowedFromAddresses.includes(log.from.toLowerCase()) && 
        !excludedAddresses.includes(log.from.toLowerCase())) {
      dailyFees.addGasToken(log.value)
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Services fees paid by blockchain using OP Stack and registered on Superchain.",
  Revenue: "All fees are collected by OP Labs.",
}

const adapter: SimpleAdapter = {
  methodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-06-01',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-04-01',
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-02-01',
    },
    [CHAIN.SONEIUM]: {
      fetch,
      start: '2024-12-01',
    },
  }
}

export default adapter
