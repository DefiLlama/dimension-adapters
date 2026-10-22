import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { METRIC } from '../../helpers/metrics';
import { addOneToken } from '../../helpers/prices';
import { formatAddress } from '../../utils/utils';
import { addIncentives, getGauges, LIQUIDITY_PAYMENTS, LIQUIDITY_PAYMENTS_TO_HOLDERS } from './incentives';

// Aero volatile and stable pools, live 2026-10-21. Same factory addresses on every chain,
// listed at https://app.aero.xyz/docs/security/
const POOL_FACTORIES = [
  '0x8E6a9FCd1d638CC760Ffba397605Fe3355dE76D2', // VolatilePoolFactory
  '0x78589E876edcEbdce72ee3436ab3c9AD3a7cEF2D', // StablePoolFactory
]

// fromBlock: a block before the factories were deployed (2026-10-19 00:00 UTC)
const chainConfig: Record<string, { fromBlock: number; start: string }> = {
  [CHAIN.BASE]: { fromBlock: 52789326, start: '2026-10-21' },
  [CHAIN.OPTIMISM]: { fromBlock: 158384611, start: '2026-10-21' },
  [CHAIN.ARBITRUM]: { fromBlock: 516123543, start: '2026-10-21' },
  [CHAIN.ETHEREUM]: { fromBlock: 26222892, start: '2026-10-21' },
  [CHAIN.INK]: { fromBlock: 58869589, start: '2026-10-21' },
  [CHAIN.ROBINHOOD]: { fromBlock: 92177714, start: '2026-10-21' },
  [CHAIN.ARC]: { fromBlock: 26684462, start: '2026-10-21' },
}

const SWAP_FEES_TO_HOLDERS = 'Swap Fees To sAERO Holders'
const POOL_CREATED = 'event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)'
const SWAP = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const FEES = 'event Fees(address indexed sender, uint256 amount0, uint256 amount1)'
const CLAIM = 'event Claim(address indexed caller, address indexed account, address indexed recipient, uint256 amount0, uint256 amount1)'
const PENDING_FEES = 'function pendingFees(address) view returns (uint256 amount0, uint256 amount1)'

// Verified source V3/src/pools/Pool.sol: each swap emits Fees with the exact fee charged
// (MEV tax included). AERO-earning deposits are staked in the gauge, which custodies the LP
// tokens, so their share of fees accrues to the gauge inside the pool: sAERO holders get the
// growth of pool.pendingFees(gauge) plus what the gauge claimed (Claim with account = gauge);
// fee-earning LPs keep the rest. Incentive programs: see ./incentives.
// Window-start state is read at fromBlock - 1 because logs include fromBlock.
const fetch = async (options: FetchOptions) => {
  const { api, chain, createBalances, getLogs, getFromBlock, getToBlock } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])

  const blacklist = new Set(getDefaultDexTokensBlacklisted(chain))
  const pools: Record<string, { token0: string; token1: string; block: number }> = {}
  const created = await getLogs({ targets: POOL_FACTORIES, fromBlock: chainConfig[chain].fromBlock, toBlock, eventAbi: POOL_CREATED, onlyArgs: false, cacheInCloud: true })
  for (const { args: { token0, token1, pool }, blockNumber } of created) {
    if (blacklist.has(formatAddress(token0)) || blacklist.has(formatAddress(token1))) continue
    pools[pool.toLowerCase()] = { token0, token1, block: blockNumber }
  }
  const targets = Object.keys(pools)

  if (targets.length) {
    const [swaps, feeLogs, claims, gauges] = await Promise.all([
      getLogs({ targets, eventAbi: SWAP, onlyArgs: false }),
      getLogs({ targets, eventAbi: FEES, onlyArgs: false }),
      getLogs({ targets, eventAbi: CLAIM, onlyArgs: false }),
      getGauges(api, POOL_FACTORIES[0]),
    ])
    for (const log of swaps) {
      const { token0, token1 } = pools[log.address.toLowerCase()]
      const amount0 = Number(log.args.amount0In) + Number(log.args.amount0Out)
      const amount1 = Number(log.args.amount1In) + Number(log.args.amount1Out)
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    }
    const poolFees: Record<string, number[]> = {}
    for (const log of feeLogs) {
      const fees = poolFees[log.address.toLowerCase()] ??= [0, 0]
      fees[0] += Number(log.args.amount0)
      fees[1] += Number(log.args.amount1)
    }

    // pendingFees of an address that held no LP is 0, so a gauge or pool created inside
    // the window starts from zero
    const staked = [...gauges].filter(([pool]) => poolFees[pool]).map(([pool, { gauge }]) => [pool, gauge])
    const stakedAtStart = staked.filter(([pool]) => pools[pool].block < fromBlock)
    const startApi = new sdk.ChainApi({ chain, block: fromBlock - 1 })
    const [pendingEnd, pendingStart] = await Promise.all([
      api.multiCall({ abi: PENDING_FEES, calls: staked.map(([pool, gauge]) => ({ target: pool, params: [gauge] })) }),
      startApi.multiCall({ abi: PENDING_FEES, calls: stakedAtStart.map(([pool, gauge]) => ({ target: pool, params: [gauge] })) }),
    ])
    const start = Object.fromEntries(stakedAtStart.map(([pool], i) => [pool, pendingStart[i]]))
    const toHolders: Record<string, number[]> = {}
    staked.forEach(([pool], i) => {
      toHolders[pool] = [0, 1].map((k) => Number(pendingEnd[i][`amount${k}`]) - Number(start[pool]?.[`amount${k}`] ?? 0))
    })
    for (const log of claims) {
      const pool = log.address.toLowerCase()
      if (!toHolders[pool] || log.args.account.toLowerCase() !== gauges.get(pool)?.gauge) continue
      toHolders[pool][0] += Number(log.args.amount0)
      toHolders[pool][1] += Number(log.args.amount1)
    }

    for (const [pool, fees] of Object.entries(poolFees)) {
      const { token0, token1 } = pools[pool]
      ;[token0, token1].forEach((token, k) => {
        if (!fees[k]) return
        // the per-LP fee index rounds down, keep the holders' share within the fee
        const revenue = Math.min(Math.max(toHolders[pool]?.[k] ?? 0, 0), fees[k])
        dailyFees.add(token, fees[k], METRIC.SWAP_FEES)
        if (revenue > 0) dailyRevenue.add(token, revenue, SWAP_FEES_TO_HOLDERS)
        if (revenue < fees[k]) dailySupplySideRevenue.add(token, fees[k] - revenue, METRIC.LP_FEES)
      })
    }

    await addIncentives(options, [...gauges].filter(([pool]) => pools[pool]).map(([, { rewards }]) => rewards), { dailyFees, dailyRevenue })
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const methodology = {
  Volume: 'Swap volume on Aero volatile and stable pools.',
  Fees: 'Swap fees paid by traders, plus incentives (Liquidity Payments, formerly bribes) that projects pay to the protocol to attract AERO Rewards to their pools.',
  Revenue: 'Swap fees earned by AERO-earning liquidity and incentives paid by projects, all distributed to sAERO holders. Excludes incentives funded by Aero itself.',
  HoldersRevenue: 'Swap fees earned by AERO-earning liquidity and incentives paid by projects, all distributed to sAERO holders. Excludes incentives funded by Aero itself.',
  SupplySideRevenue: 'Swap fees kept by fee-earning liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees paid by traders.',
    [LIQUIDITY_PAYMENTS]: 'Incentives (formerly bribes) that projects pay to the protocol for a pool, counted as the protocol streams them out. Excludes incentives funded by Aero itself.',
  },
  Revenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity, distributed to sAERO holders.',
    [LIQUIDITY_PAYMENTS_TO_HOLDERS]: 'Incentives paid by projects to the protocol, distributed to sAERO holders allocating to the pool.',
  },
  HoldersRevenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity, distributed to sAERO holders.',
    [LIQUIDITY_PAYMENTS_TO_HOLDERS]: 'Incentives paid by projects to the protocol, distributed to sAERO holders allocating to the pool.',
  },
  SupplySideRevenue: { [METRIC.LP_FEES]: 'Swap fees kept by fee-earning liquidity providers.' },
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
