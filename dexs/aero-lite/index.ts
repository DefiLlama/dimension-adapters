import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { addOneToken } from '../../helpers/prices';
import { formatAddress } from '../../utils/utils';
import PromisePool from "@supercharge/promise-pool";

// Aero Lite: the Slipstream (concentrated liquidity) deployment of Aero, the merged
// Aerodrome + Velodrome protocol. Separate listing from dexs/aerodrome-slipstream because
// these pools use a dynamic fee that moves several times a day (a single fee() snapshot per
// window misprices earlier swaps) and no gauges are registered yet (every pool's gaugeFees()
// is zero and CLFactory.getUnstakedFee is 0), so all swap fees go to LPs.
// The CL factory is deployed on every launch chain; only Arc has pools so far.
const CONFIG: Record<string, { factory: string; fromBlock: number; start: string }> = {
  // fromBlock = factory deployment block (sourcify); start = its date
  [CHAIN.ARC]: { factory: '0xb89Df768aF2CFE637ceB352c587Fe8edAf491d03', fromBlock: 20968879, start: '2026-09-15' },
  [CHAIN.BASE]: { factory: '0xC6bdE6e9F0CD71013E5FcF2dAAE2fA1c71Bb2F25', fromBlock: 52691540, start: '2026-10-16' },
  [CHAIN.OPTIMISM]: { factory: '0xf3384180f1F99Ff4448e836b7773e7B7A2D1fa3b', fromBlock: 158287133, start: '2026-10-16' },
  [CHAIN.ARBITRUM]: { factory: '0x2f1ea2c2dEf80FCa460c0dcF205C281a8116834b', fromBlock: 515450473, start: '2026-10-16' },
  [CHAIN.ETHEREUM]: { factory: '0xAbD524b6f8dAae68314Ad2fD7698cb65b4f8D398', fromBlock: 26206676, start: '2026-10-16' },
  [CHAIN.INK]: { factory: '0xAbD524b6f8dAae68314Ad2fD7698cb65b4f8D398', fromBlock: 58674934, start: '2026-10-16' },
  [CHAIN.ROBINHOOD]: { factory: '0xAbD524b6f8dAae68314Ad2fD7698cb65b4f8D398', fromBlock: 90275986, start: '2026-10-16' },
}
const FEE_SAMPLE_STEP = 1000 // blocks; fee() is resampled once per step and applied to the swaps in it

const POOL_CREATED = 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)'
const SWAP = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getLogs, getToBlock, chain } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const { factory, fromBlock } = CONFIG[chain]
  const toBlock = await getToBlock()

  const blacklist = new Set(getDefaultDexTokensBlacklisted(chain))
  const pools: Record<string, { token0: string; token1: string }> = {}
  const created = await getLogs({ target: factory, fromBlock, toBlock, eventAbi: POOL_CREATED, cacheInCloud: true })
  for (const { token0, token1, pool } of created) {
    if (blacklist.has(formatAddress(token0)) || blacklist.has(formatAddress(token1))) continue
    pools[pool.toLowerCase()] = { token0, token1 }
  }
  const targets = Object.keys(pools)
  if (!targets.length) return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees.clone() }

  const swaps = await getLogs({ targets, eventAbi: SWAP, onlyArgs: false })

  // group swaps by fee-sample block, then read each pool's fee() once per group
  const groups: Record<number, any[]> = {}
  for (const log of swaps) {
    const sampleBlock = Math.min(Math.floor(log.blockNumber / FEE_SAMPLE_STEP) * FEE_SAMPLE_STEP + FEE_SAMPLE_STEP - 1, toBlock)
    ;(groups[sampleBlock] ??= []).push(log)
  }

  await PromisePool.withConcurrency(5).for(Object.entries(groups)).handleError((e) => { throw e }).process(async ([block, logs]) => {
    const poolAddrs = [...new Set(logs.map((l) => l.address.toLowerCase()))]
    const fees = await api.multiCall({ abi: 'uint256:fee', calls: poolAddrs, block: +block })
    const feeByPool = Object.fromEntries(poolAddrs.map((p, i) => [p, Number(fees[i]) / 1e6]))
    for (const log of logs) {
      const pool = log.address.toLowerCase()
      const { token0, token1 } = pools[pool]
      const amount0 = Number(log.args.amount0)
      const amount1 = Number(log.args.amount1)
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      // fee is charged on the input side (positive amount)
      if (amount0 > 0) dailyFees.add(token0, amount0 * feeByPool[pool], 'Token Swap Fees')
      if (amount1 > 0) dailyFees.add(token1, amount1 * feeByPool[pool], 'Token Swap Fees')
    }
  })

  return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees.clone() }
}

const methodology = {
  Volume: 'Swap volume on Aero Lite concentrated liquidity pools, counting one side of each swap.',
  Fees: 'Swap fees paid by traders, using each pool\'s on-chain fee rate resampled every 1000 blocks since the rate adjusts dynamically.',
  Revenue: 'Zero: no gauges are registered for these pools yet, so no fees are redirected away from LPs.',
  SupplySideRevenue: 'All swap fees, paid to liquidity providers.',
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': 'Swap fees paid by traders on Aero Lite pools.' },
  SupplySideRevenue: { 'Token Swap Fees': 'Swap fees paid to liquidity providers.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: Object.fromEntries(Object.entries(CONFIG).map(([chain, { start }]) => [chain, { fetch, start }])),
}

export default adapter
