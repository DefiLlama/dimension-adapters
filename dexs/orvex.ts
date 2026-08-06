import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addOneToken } from "../helpers/prices"

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  HOLDERS_REVENUE: 'Swap Fees To veORVX Holders',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  NO_LP_REVENUE: 'No Supply-Side Revenue (Gauge Model)',
}

type ChainConfig = { clPoolManager: string, fromBlock: number, start: string }

// Orvex v4 concentrated-liquidity deployment on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// CLPoolManager creation tx block = fromBlock; the start date is that block's timestamp.
// CLPoolManager: https://robinhoodchain.blockscout.com/address/0xd01C774d4A66408326Bc65728Ac5Ae5aAf004032
// Vault singleton (settle/take target, holds all v4 token balances): https://robinhoodchain.blockscout.com/address/0xFe7E25dE55e5cBbEcCcb661F3679F873f72B9b0D
const config: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    clPoolManager: '0xd01C774d4A66408326Bc65728Ac5Ae5aAf004032',
    fromBlock: 3074079,
    start: '2026-07-06',
  },
}

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
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

  const dailyFees = swapFees.clone(1, METRIC.SWAP_FEES)
  const dailyRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = protocolRevenue.clone(1, METRIC.PROTOCOL_REVENUE)
  const dailySupplySideRevenue = createBalances()

  const holdersRevenue = swapFees.clone(1)
  holdersRevenue.subtract(protocolRevenue)
  dailyHoldersRevenue.add(holdersRevenue, METRIC.HOLDERS_REVENUE)

  dailyRevenue.add(holdersRevenue, METRIC.HOLDERS_REVENUE)
  dailyRevenue.add(protocolRevenue, METRIC.PROTOCOL_REVENUE)

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
  adapter: {},
  methodology: {
    Fees: 'Total swap fees paid by traders on Orvex v4 concentrated liquidity pools.',
    Revenue: 'All swap fees are revenue - the LP portion is routed to veORVX voters via the gauge system, and any protocol-fee portion goes to the Orvex treasury.',
    ProtocolRevenue: 'Portion of swap fees taken as the on-chain protocolFee (0 by default).',
    HoldersRevenue: 'Portion of swap fees distributed to veORVX voters through the gauge/FeeDistributor flow (fee minus protocolFee).',
    SupplySideRevenue: 'Zero - liquidity providers stake in gauges and forgo direct swap-fee earnings in exchange for oORVX emissions, so trading fees never accrue to LPs.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total swap fees paid by traders.',
    },
    Revenue: {
      [METRIC.HOLDERS_REVENUE]: 'Swap fees distributed to veORVX voters via gauges.',
      [METRIC.PROTOCOL_REVENUE]: 'Swap fees taken by the protocol (on-chain protocolFee).',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Swap fees taken by the protocol (on-chain protocolFee).',
    },
    HoldersRevenue: {
      [METRIC.HOLDERS_REVENUE]: 'Swap fees distributed to veORVX voters via gauges.',
    },
    SupplySideRevenue: {
      [METRIC.NO_LP_REVENUE]: 'Zero - LPs stake in gauges and earn oORVX emissions instead of swap fees; no fees accrue to the supply side.',
    },
  },
}

Object.keys(config).forEach(chain => {
  const { start } = config[chain];
  (adapter.adapter as BaseAdapter)[chain] = { fetch, start }
})

export default adapter
