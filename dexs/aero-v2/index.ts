// Changes to this adapter's revenue methodology require further approval before merging:
// a Trueo market depends on this data.

import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { METRIC } from '../../helpers/metrics';
import { formatAddress } from '../../utils/utils';
import { addBribes, addPoolFee, addVolume, BRIBES, BRIBES_TO_HOLDERS, getGauges, newFlow, SwapFlow } from './utils';

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
// fee-earning LPs keep the rest. Bribes and pricing: see ./utils. Amounts stay bigint (raw units).
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
    // net amount per token: a flash swap that borrows and repays the same token only adds its fee
    const net = (a: bigint, b: bigint) => (a > b ? a - b : b - a)
    const flows: Record<string, SwapFlow> = {}
    for (const log of swaps) {
      const pool = log.address.toLowerCase()
      const { token0, token1 } = pools[pool]
      const [in0, in1, out0, out1] = [log.args.amount0In, log.args.amount1In, log.args.amount0Out, log.args.amount1Out].map(BigInt)
      addVolume(dailyVolume, chain, [token0, token1], [net(in0, out0), net(in1, out1)])
      const flow = flows[pool] ??= newFlow()
      if (in0 > 0n && out1 > 0n) { flow.in[0] += in0; flow.outOther[0] += out1 }
      if (in1 > 0n && out0 > 0n) { flow.in[1] += in1; flow.outOther[1] += out0 }
    }
    const poolFees: Record<string, bigint[]> = {}
    for (const log of feeLogs) {
      const fees = poolFees[log.address.toLowerCase()] ??= [0n, 0n]
      fees[0] += BigInt(log.args.amount0)
      fees[1] += BigInt(log.args.amount1)
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
    const toHolders: Record<string, bigint[]> = {}
    staked.forEach(([pool], i) => {
      toHolders[pool] = [0, 1].map((k) => BigInt(pendingEnd[i][`amount${k}`]) - BigInt(start[pool]?.[`amount${k}`] ?? 0))
    })
    for (const log of claims) {
      const pool = log.address.toLowerCase()
      if (!toHolders[pool] || log.args.account.toLowerCase() !== gauges.get(pool)?.gauge) continue
      toHolders[pool][0] += BigInt(log.args.amount0)
      toHolders[pool][1] += BigInt(log.args.amount1)
    }

    for (const [pool, fees] of Object.entries(poolFees)) {
      const { token0, token1 } = pools[pool]
      ;[0, 1].forEach((k) => {
        const fee = fees[k]
        if (!fee) return
        // the per-LP fee index rounds down, keep the holders' share within the fee
        const share = toHolders[pool]?.[k] ?? 0n
        const revenue = share < 0n ? 0n : share > fee ? fee : share
        addPoolFee(chain, [token0, token1], k, flows[pool] ?? newFlow(), [
          [dailyFees, fee, METRIC.SWAP_FEES],
          [dailyRevenue, revenue, SWAP_FEES_TO_HOLDERS],
          [dailySupplySideRevenue, fee - revenue, METRIC.LP_FEES],
        ])
      })
    }

    await addBribes(options, [...gauges].filter(([pool]) => pools[pool]).map(([, { rewards }]) => rewards), { dailyFees, dailyRevenue })
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const methodology = {
  Volume: 'Swap volume on Aero volatile and stable pools.',
  Fees: 'Swap fees paid by traders, plus bribes paid to the protocol to attract AERO Rewards to pools.',
  Revenue: 'Swap fees earned by AERO-earning liquidity and bribes, all distributed to sAERO holders.',
  HoldersRevenue: 'Swap fees earned by AERO-earning liquidity and bribes, all distributed to sAERO holders.',
  SupplySideRevenue: 'Swap fees kept by fee-earning liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees paid by traders.',
    [BRIBES]: 'Bribes (Aero calls them Liquidity Payments) paid to the protocol for a pool, counted as the protocol streams them out.',
  },
  Revenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity, distributed to sAERO holders.',
    [BRIBES_TO_HOLDERS]: 'Bribes paid to the protocol, distributed to sAERO holders allocating to the pool.',
  },
  HoldersRevenue: {
    [SWAP_FEES_TO_HOLDERS]: 'Swap fees earned by AERO-earning liquidity, distributed to sAERO holders.',
    [BRIBES_TO_HOLDERS]: 'Bribes paid to the protocol, distributed to sAERO holders allocating to the pool.',
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
