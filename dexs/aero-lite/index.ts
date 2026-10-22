import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { addOneToken } from '../../helpers/prices';
import { formatAddress } from '../../utils/utils';
import PromisePool from "@supercharge/promise-pool";
import { addIncentives, getGauges, LIQUIDITY_PAYMENTS, LIQUIDITY_PAYMENTS_TO_HOLDERS } from '../aero-v2/incentives';

const SWAP_FEES_TO_HOLDERS = 'Swap Fees To sAERO Holders'

// Aero concentrated liquidity pools. Separate listing from dexs/aerodrome-slipstream
// (legacy Aerodrome pools); Aero volatile/stable pools are dexs/aero-v2.

// Aero Lite: the first Aero deployment, on Arc only. Its pools use a dynamic fee that
// moves several times a day (a single fee() snapshot per window misprices earlier swaps)
// and no Voter/gauge system is deployed for it (factory.voter() is the zero address), so
// all swap fees go to LPs.
const LITE_FACTORY = '0xb89Df768aF2CFE637ceB352c587Fe8edAf491d03'
const LITE_DEPLOY_BLOCK = 21068653
const FEE_SAMPLE_STEP = 1000 // blocks; fee() is resampled once per step and applied to the swaps in it

// Aero CL factories, live 2026-10-21, listed at https://app.aero.xyz/docs/security/
// fromBlock: a block before the factory was deployed (2026-10-19 00:00 UTC)
const chainConfig: Record<string, { factory: string; fromBlock: number; start: string }> = {
  [CHAIN.BASE]: { factory: '0x9CB220581b91b0C83223012FE69688b92aD07a76', fromBlock: 52789326, start: '2026-10-21' },
  [CHAIN.OPTIMISM]: { factory: '0xfeaB42D90055db3a0616249f76B6002D72266778', fromBlock: 158384611, start: '2026-10-21' },
  [CHAIN.ARBITRUM]: { factory: '0x88a60ee77392577c355C0acb2A8d476D5a4EC03a', fromBlock: 516123543, start: '2026-10-21' },
  [CHAIN.ETHEREUM]: { factory: '0xF4Fd2E6c5B60c5b365cd1B96DD6245E6D60414c2', fromBlock: 26222892, start: '2026-10-21' },
  [CHAIN.INK]: { factory: '0x7660BF2aDefC687C22906112ca323d60A00358cF', fromBlock: 58869589, start: '2026-10-21' },
  [CHAIN.ROBINHOOD]: { factory: '0xc63d7338c178e805c544B8f897066bD3BBcBE136', fromBlock: 92177714, start: '2026-10-21' },
  [CHAIN.ARC]: { factory: '0x7F83235643181E440433400a027618Cd50879751', fromBlock: 26684462, start: '2026-09-16' }, // start is Aero Lite's
}

const POOL_CREATED = 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)'
const SWAP = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const COLLECT_FEES = 'event CollectFees(address indexed recipient, uint128 amount0, uint128 amount1)'
const GAUGE_FEES = 'function gaugeFees() view returns (uint128 token0, uint128 token1)'
const TAPE_ACCUMULATORS = 'function accumulators(address) view returns ((uint40 lastSwapTimestamp, uint40 lastObservationTimestamp, uint32 swapCount, int24 lastTick, int24 intervalMaxTick, int24 intervalMinTick, int24 intervalOpenTick, uint48 volatilityCorrob, uint120 cumulativeVolume0, uint120 cumulativeVolume1, uint16 intervalSwapCount, uint120 cumulativeFee0, uint120 cumulativeFee1, uint8 volatilityRingHead, uint8 volatilityRingCount, uint120 cumulativeMevVolume0, uint120 cumulativeMevVolume1, uint8 nOver, uint120 cumulativeMevFee0, uint120 cumulativeMevFee1))'

// pool -> tokens and creation block, skipping pools with blacklisted tokens
const getPools = async (options: FetchOptions, factory: string, fromBlock: number) => {
  const blacklist = new Set(getDefaultDexTokensBlacklisted(options.chain))
  const pools: Record<string, { token0: string; token1: string; block: number }> = {}
  const created = await options.getLogs({ target: factory, fromBlock, toBlock: await options.getToBlock(), eventAbi: POOL_CREATED, onlyArgs: false, cacheInCloud: true })
  for (const { args: { token0, token1, pool }, blockNumber } of created) {
    if (blacklist.has(formatAddress(token0)) || blacklist.has(formatAddress(token1))) continue
    pools[pool.toLowerCase()] = { token0, token1, block: blockNumber }
  }
  return pools
}

const addLitePools = async (options: FetchOptions, { dailyVolume, dailyFees, dailySupplySideRevenue }: any) => {
  const { api, getLogs, getToBlock, chain } = options
  const toBlock = await getToBlock()
  const pools = await getPools(options, LITE_FACTORY, LITE_DEPLOY_BLOCK)
  const swaps = await getLogs({ targets: Object.keys(pools), eventAbi: SWAP, onlyArgs: false })

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
      // fee is charged on the input side (positive amount), all of it to LPs
      for (const [token, amount] of [[token0, amount0], [token1, amount1]] as [string, number][]) {
        if (amount <= 0) continue
        dailyFees.add(token, amount * feeByPool[pool], 'Token Swap Fees')
        dailySupplySideRevenue.add(token, amount * feeByPool[pool], 'Token Swap Fees')
      }
    }
  })
}

// Aero CL pools (verified source: CLPool.sol, DynamicSwapFeeHook.sol). A hook sets the fee
// of each swap, so fee() is only the base rate; the hook records every swap's fee on the
// CL pool tape: cumulativeFee is the full fee, MEV tax included (cumulativeMevFee is only
// the MEV part of it, so it is not added again). The sAERO holders' share (fees of AERO-earning
// liquidity staked in gauges plus the cut on fee-earning liquidity fees) accrues in
// pool.gaugeFees() until the gauge collects it (CollectFees). Incentive programs: see
// ../aero-v2/incentives.
// The tape only records pools its owner registered (allowedCaller); unregistered pools
// get volume but no fees (at launch: 8 of 412 Base pools, none with a gauge, ~$1/day).
// Window-start state is read at fromBlock - 1 because logs include fromBlock.
const addV3Pools = async (options: FetchOptions, { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }: any) => {
  const { api, getLogs, getFromBlock, chain } = options
  const { factory, fromBlock: factoryFromBlock } = chainConfig[chain]
  const fromBlock = await getFromBlock()
  const pools = await getPools(options, factory, factoryFromBlock)
  const targets = Object.keys(pools)
  if (!targets.length) return

  const [swaps, collects, tape] = await Promise.all([
    getLogs({ targets, eventAbi: SWAP, onlyArgs: false }),
    getLogs({ targets, eventAbi: COLLECT_FEES, onlyArgs: false }),
    // ponytail: tape read at the window end; a tape swap mid-window undercounts that window
    api.call({ target: factory, abi: 'address:clPoolTape' }),
  ])
  for (const log of swaps) {
    const { token0, token1 } = pools[log.address.toLowerCase()]
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.args.amount0, amount1: log.args.amount1 })
  }
  const collected: Record<string, number[]> = {}
  for (const log of collects) {
    const c = collected[log.address.toLowerCase()] ??= [0, 0]
    c[0] += Number(log.args.amount0)
    c[1] += Number(log.args.amount1)
  }

  // pools created inside the window start from zero
  const startApi = new sdk.ChainApi({ chain, block: fromBlock - 1 })
  const existing = targets.filter((p) => pools[p].block < fromBlock)
  const [tapeEnd, tapeStart, gaugeEnd, gaugeStart] = await Promise.all([
    api.multiCall({ target: tape, abi: TAPE_ACCUMULATORS, calls: targets.map((p) => ({ params: [p] })) }),
    startApi.multiCall({ target: tape, abi: TAPE_ACCUMULATORS, calls: existing.map((p) => ({ params: [p] })) }),
    api.multiCall({ abi: GAUGE_FEES, calls: targets }),
    startApi.multiCall({ abi: GAUGE_FEES, calls: existing }),
  ])
  const start = Object.fromEntries(existing.map((p, i) => [p, { tape: tapeStart[i], gauge: gaugeStart[i] }]))

  targets.forEach((pool, i) => {
    const { token0, token1 } = pools[pool]
    // the tape discards pre-seeded values on a pool's first swap, so it counts from zero until then
    const startTape = Number(start[pool]?.tape.lastSwapTimestamp ?? 0) > 0 ? start[pool].tape : null
    const tapeFee = (t: any, k: number) => t ? Number(t[`cumulativeFee${k}`]) : 0
    ;[token0, token1].forEach((token, k) => {
      const fee = tapeFee(tapeEnd[i], k) - tapeFee(startTape, k)
      if (fee <= 0) return
      const toHolders = Number(gaugeEnd[i][`token${k}`]) - Number(start[pool]?.gauge[`token${k}`] ?? 0) + (collected[pool]?.[k] ?? 0)
      // the pool and the tape round the fee separately, keep the holders' share within it
      const revenue = Math.min(Math.max(toHolders, 0), fee)
      dailyFees.add(token, fee, 'Token Swap Fees')
      if (revenue > 0) dailyRevenue.add(token, revenue, SWAP_FEES_TO_HOLDERS)
      if (revenue < fee) dailySupplySideRevenue.add(token, fee - revenue, 'Token Swap Fees')
    })
  })

  const gauges = await getGauges(api, factory)
  await addIncentives(options, [...gauges].filter(([pool]) => pools[pool]).map(([, { rewards }]) => rewards), { dailyFees, dailyRevenue })
}

const fetch = async (options: FetchOptions) => {
  const balances = {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  }
  if (options.chain === CHAIN.ARC) await addLitePools(options, balances)
  await addV3Pools(options, balances)
  return { ...balances, dailyHoldersRevenue: balances.dailyRevenue.clone() }
}

const methodology = {
  Volume: 'Swap volume on Aero Slipstream (concentrated liquidity) pools, counting one side of each swap.',
  Fees: 'Swap fees paid by traders, plus incentives (Liquidity Payments) that projects pay to sAERO holders.',
  Revenue: 'Swap fees earned by AERO-earning liquidity, the protocol share of fee-earning liquidity fees and incentives paid by projects, all distributed to sAERO holders. Excludes incentives funded by Aero itself.',
  HoldersRevenue: 'Swap fees earned by AERO-earning liquidity, the protocol share of fee-earning liquidity fees and incentives paid by projects, all distributed to sAERO holders. Excludes incentives funded by Aero itself.',
  SupplySideRevenue: 'Swap fees kept by fee-earning liquidity providers, and all fees of the original Aero Lite pools on Arc, which have no gauges.',
}

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'Swap fees paid by traders.',
    [LIQUIDITY_PAYMENTS]: 'Incentives that projects pay to sAERO holders allocating to a pool, counted as they stream. Excludes incentives funded by Aero itself.',
  },
  Revenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity plus the protocol share of fee-earning liquidity fees, distributed to sAERO holders.',
    [LIQUIDITY_PAYMENTS_TO_HOLDERS]: 'Incentives paid by projects, streamed to sAERO holders allocating to the pool.',
  },
  HoldersRevenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity plus the protocol share of fee-earning liquidity fees, distributed to sAERO holders.',
    [LIQUIDITY_PAYMENTS_TO_HOLDERS]: 'Incentives paid by projects, streamed to sAERO holders allocating to the pool.',
  },
  SupplySideRevenue: { 'Token Swap Fees': 'Swap fees kept by fee-earning liquidity providers.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
