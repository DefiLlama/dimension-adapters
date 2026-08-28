import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addOneToken } from "../helpers/prices"
import { getUniV2LogAdapter } from "../helpers/uniswap"

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  HOLDERS_REVENUE: 'Swap Fees To veORVX Holders',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  NO_LP_REVENUE: 'No Supply-Side Revenue (Gauge Model)',
}

type ChainConfig = {
  clPoolManager: string
  fromBlock: number
  start: string
  v2Factory: string
  v2Fees: number
  v2StableFees: number
}

// Orvex on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// v2: Lynex-fork Solidly. PairFactoryUpgradeable: https://robinhoodchain.blockscout.com/address/0x5c98b2d892b37c9a1D3b69472bdDc172A64CdC09
//     stableFee=40, volatileFee=180 (denom 1e5 -> 0.04%/0.18%); 100% of swap fees to veORVX via
//     FeeDistributor https://robinhoodchain.blockscout.com/address/0xB9aC1b9763c346696d064E2c666a806D78aB02b9
// v4: concentrated-liquidity. CLPoolManager creation tx block = fromBlock.
//     CLPoolManager: https://robinhoodchain.blockscout.com/address/0xd01C774d4A66408326Bc65728Ac5Ae5aAf004032
//     Vault: https://robinhoodchain.blockscout.com/address/0xFe7E25dE55e5cBbEcCcb661F3679F873f72B9b0D
const config: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    clPoolManager: '0xd01C774d4A66408326Bc65728Ac5Ae5aAf004032',
    fromBlock: 3074079,
    start: '2026-07-03',
    v2Factory: '0x5c98b2d892b37c9a1D3b69472bdDc172A64CdC09',
    v2Fees: 0.0018,
    v2StableFees: 0.0004,
  },
}

async function fetchV4({ getLogs, createBalances, chain }: FetchOptions) {
  const { clPoolManager, fromBlock } = config[chain]
  const dailyVolume = createBalances()
  const swapFees = createBalances()
  const protocolRevenue = createBalances()

  const initializeLogs = await getLogs({
    target: clPoolManager,
    fromBlock,
    cacheInCloud: true,
    eventAbi: 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
  })

  const poolMap: Record<string, { currency0: string, currency1: string }> = {}
  initializeLogs.forEach((log: any) => {
    const { id, currency0, currency1 } = log
    poolMap[id.toLowerCase()] = { currency0, currency1 }
  })

  const swapLogs = await getLogs({
    target: clPoolManager,
    eventAbi: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)',
  })

  const FEE_DENOM = BigInt(1e6)

  swapLogs.forEach((log: any) => {
    const { id, amount0, amount1, protocolFee, fee } = log
    const pool = poolMap[id.toLowerCase()]
    if (!pool) return

    const { currency0, currency1 } = pool
    const feeBI = BigInt(fee)
    const protocolFeeBI = BigInt(protocolFee)
    const amount0Fees = (BigInt(amount0) * feeBI) / FEE_DENOM
    const amount1Fees = (BigInt(amount1) * feeBI) / FEE_DENOM
    const amount0ProtocolFees = (BigInt(amount0) * protocolFeeBI) / FEE_DENOM
    const amount1ProtocolFees = (BigInt(amount1) * protocolFeeBI) / FEE_DENOM

    addOneToken({ chain, balances: dailyVolume, token0: currency0, amount0, token1: currency1, amount1 })
    addOneToken({ chain, balances: swapFees, token0: currency0, amount0: amount0Fees, token1: currency1, amount1: amount1Fees })
    addOneToken({ chain, balances: protocolRevenue, token0: currency0, amount0: amount0ProtocolFees, token1: currency1, amount1: amount1ProtocolFees })
  })

  return { dailyVolume, swapFees, protocolRevenue }
}

async function fetch(options: FetchOptions) {
  const { createBalances, chain } = options
  const { v2Factory, v2Fees, v2StableFees } = config[chain]

  const [v4, v2] = await Promise.all([
    fetchV4(options),
    getUniV2LogAdapter({
      factory: v2Factory,
      fees: v2Fees,
      stableFees: v2StableFees,
      userFeesRatio: 1,
      revenueRatio: 1,
      protocolRevenueRatio: 0,
      holdersRevenueRatio: 1,
    })(options),
  ])

  const dailyVolume = v4.dailyVolume
  dailyVolume.addBalances(v2.dailyVolume)

  const dailyFees = createBalances()
  dailyFees.addBalances(v4.swapFees, METRIC.SWAP_FEES)
  dailyFees.addBalances(v2.dailyFees, METRIC.SWAP_FEES)

  const dailyProtocolRevenue = createBalances()
  dailyProtocolRevenue.addBalances(v4.protocolRevenue, METRIC.PROTOCOL_REVENUE)

  const dailyHoldersRevenue = createBalances()
  const v4HoldersRevenue = v4.swapFees.clone(1)
  v4HoldersRevenue.subtract(v4.protocolRevenue)
  dailyHoldersRevenue.addBalances(v4HoldersRevenue, METRIC.HOLDERS_REVENUE)
  // v2: 100% of swap fees to veORVX holders, no protocol take
  dailyHoldersRevenue.addBalances(v2.dailyFees, METRIC.HOLDERS_REVENUE)

  const dailyRevenue = createBalances()
  dailyRevenue.addBalances(v4HoldersRevenue, METRIC.HOLDERS_REVENUE)
  dailyRevenue.addBalances(v4.protocolRevenue, METRIC.PROTOCOL_REVENUE)
  dailyRevenue.addBalances(v2.dailyFees, METRIC.HOLDERS_REVENUE)

  const dailySupplySideRevenue = createBalances()

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    Fees: 'Total swap fees paid by traders on Orvex v2 Solidly pools (0.18% volatile / 0.04% stable) and Orvex v4 concentrated liquidity pools.',
    Revenue: 'All swap fees are revenue - the LP portion is routed to veORVX voters via the gauge system, and any protocol-fee portion goes to the Orvex treasury.',
    ProtocolRevenue: 'Portion of swap fees taken as the on-chain protocolFee on v4 pools (0 by default). v2 takes no protocol fee.',
    HoldersRevenue: 'Portion of swap fees distributed to veORVX voters through the gauge/FeeDistributor flow (v2: 100% of fees; v4: fee minus protocolFee).',
    SupplySideRevenue: 'Zero - liquidity providers stake in gauges and forgo direct swap-fee earnings in exchange for oORVX emissions, so trading fees never accrue to LPs.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total swap fees paid by traders on v2 and v4 pools.',
    },
    Revenue: {
      [METRIC.HOLDERS_REVENUE]: 'Swap fees distributed to veORVX voters via gauges.',
      [METRIC.PROTOCOL_REVENUE]: 'Swap fees taken by the protocol (v4 on-chain protocolFee).',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Swap fees taken by the protocol (v4 on-chain protocolFee).',
    },
    HoldersRevenue: {
      [METRIC.HOLDERS_REVENUE]: 'Swap fees distributed to veORVX voters via gauges.',
    },
  },
}


export default adapter
