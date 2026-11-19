import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { filterPools } from "../helpers/uniswap";

// PancakeSwap V3 fork on X Layer. Moved off the Goldsky subgraph (okieswap-v3/0.4.0), which stopped indexing at
// block 76105193 (2026-11-17 00:10 UTC), to the factory's PoolCreated logs and the pools' Swap logs
const factory = '0x3cea59ae7cd3c1bea32ccc80f68dd47576662c90'
const factoryFromBlock = 31017077 // first PoolCreated, 2025-08-17 09:22 UTC (factory deployed at block 31015016)
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol'
const SWAP_FEES_TO_LPS = 'Swap Fees To LPs'

const blacklistedPools = new Set(['0x4e6c7d221b5fa285aabdd8c7fa692bc0c79e7d8b'])
const invalidSpikes: Record<string, Set<string>> = {
  '2026-06-18': new Set(['0x7f566d2dff0eb5450126624f6c6f75daecb2196b']), // 15K liquidity had 18M in volume
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const poolLogs = await getLogs({ target: factory, eventAbi: poolCreatedEvent, fromBlock: factoryFromBlock, cacheInCloud: true })
  const pairObject: Record<string, string[]> = {}
  const feeTiers: Record<string, number> = {}
  poolLogs.forEach((log: any) => {
    const pool = log.pool.toLowerCase()
    if (blacklistedPools.has(pool) || invalidSpikes[options.dateString]?.has(pool)) return
    pairObject[pool] = [log.token0, log.token1]
    feeTiers[pool] = Number(log.fee) / 1e6
  })

  // the subgraph source summed the 100 largest pools by TVL
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize: 100 })
  const pairs = Object.keys(filteredPairs)
  const allLogs = pairs.length ? await getLogs({ targets: pairs, eventAbi: swapEvent, flatten: false }) : []

  allLogs.forEach((logs: any[], index: number) => {
    const pair = pairs[index]
    const [token0, token1] = pairObject[pair]
    const feeTier = feeTiers[pair]
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeTier, amount1: Number(log.amount1) * feeTier, label: METRIC.SWAP_FEES })

      // protocolFeesToken0/1 is the protocol's exact cut of this swap's fee, charged on the input token; turn it
      // into a share of the fee so it applies to whichever leg is priced (the share is set per pool)
      const amount0 = Math.abs(Number(log.amount0))
      const amount1 = Math.abs(Number(log.amount1))
      const protocolFee0 = Number(log.protocolFeesToken0)
      const protocolFee1 = Number(log.protocolFeesToken1)
      let protocolShare = 0
      if (protocolFee0 > 0 && amount0 > 0) protocolShare = protocolFee0 / (amount0 * feeTier)
      else if (protocolFee1 > 0 && amount1 > 0) protocolShare = protocolFee1 / (amount1 * feeTier)
      protocolShare = Math.min(Math.max(protocolShare, 0), 1)

      dailyRevenue.add(token, amount * protocolShare, SWAP_FEES_TO_PROTOCOL)
      dailySupplySideRevenue.add(token, amount * (1 - protocolShare), SWAP_FEES_TO_LPS)
    })
  })

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: '2025-08-17',
    },
  },
  methodology: {
    Volume: 'Swap volume across OkieSwap V3 pools on X Layer.',
    Fees: 'Trading fees paid by swappers, equal to each pool\'s fee tier.',
    Revenue: 'Protocol\'s share of trading fees, the exact amount each swap emits as protocolFeesToken0/1.',
    ProtocolRevenue: 'Protocol\'s share of trading fees, the exact amount each swap emits as protocolFeesToken0/1, kept by the protocol.',
    SupplySideRevenue: 'Trading fees left to liquidity providers after the protocol\'s share.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: 'Trading fees paid by swappers, equal to each pool\'s fee tier.' },
    Revenue: { [SWAP_FEES_TO_PROTOCOL]: 'Protocol\'s share of trading fees, read from each swap\'s protocolFeesToken0/1.' },
    ProtocolRevenue: { [SWAP_FEES_TO_PROTOCOL]: 'Protocol\'s share of trading fees, read from each swap\'s protocolFeesToken0/1.' },
    SupplySideRevenue: { [SWAP_FEES_TO_LPS]: 'Trading fees left to liquidity providers after the protocol\'s share.' },
  },
};

export default adapter;
