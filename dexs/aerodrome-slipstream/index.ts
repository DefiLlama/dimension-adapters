import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";
import { handleBribeToken } from "../aerodrome/utils";

const CONFIG = {
  factories: [
    {
      address: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',
      fromBlock: 13843704,
      skipIndexer: true,
    },
    {
      address: '0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a',
      fromBlock: 36953918,
      skipIndexer: false,
    },
    {
      address: '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef',
      fromBlock: 44394724,
      skipIndexer: false,
    }
  ],
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
  gaugeFactories: [
    '0xd30677bd8dd15132f251cb54cbda552d2a05fb08',
    '0xB630227a79707D517320b6c0f885806389dFcbB3',
  ].map(f => f.toLowerCase()),
}


const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  event_gaugeCreated: 'event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)',
  event_notify_reward: 'event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)',
  event_claim_rewards: 'event ClaimRewards(address indexed from, address indexed reward, uint256 amount)',
  // Emitted by CLPool when the gauge withdraws accumulated gaugeFees via collectFees(recipient, ...).
  event_collect_fees: 'event CollectFees(address indexed recipient, uint128 amount0, uint128 amount1)',
}

const abis = {
  fee: 'uint256:fee',
  // Per-token accumulator of fees waiting for the gauge to collect.  Per Aerodrome team's
  // confirmation, this is the on-chain ground truth for "fee rewards to voters" — capturing
  // the staked-LP share plus the unstaked-LP rake routed to the gauge.  Resets when
  // collectFees() is called.
  gaugeFees: 'function gaugeFees() view returns (uint128 token0, uint128 token1)',
}

const getGaugeMetadata = async (
  fetchOptions: FetchOptions,
): Promise<{ bribeSet: Set<string> }> => {
  const logs = await fetchOptions.getLogs({
    target: CONFIG.voter,
    fromBlock: 13843704,
    eventAbi: eventAbis.event_gaugeCreated,
    skipIndexer: true,
    cacheInCloud: true,
  })
  const bribeSet = new Set<string>()
  for (const log of logs as any[]) {
    if (!CONFIG.gaugeFactories.includes(String(log[2]).toLowerCase())) continue
    bribeSet.add(String(log[4]).toLowerCase())
  }
  return { bribeSet }
}

const getBribes = async (
  fetchOptions: FetchOptions,
  bribeSet: Set<string>,
): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, getLogs, startTimestamp } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_notify_reward])
  const dailyBribesRevenue = createBalances()
  if (bribeSet.size === 0) return { dailyBribesRevenue }

  const logs = await getLogs({ noTarget: true, eventAbi: eventAbis.event_notify_reward, entireLog: true })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return
    const parsedLog = iface.parseLog(log)
    const token = parsedLog!.args.reward.toLowerCase()
    const amount = parsedLog!.args.amount
    // Try to handle pre-launch token conversion
    handleBribeToken(token, amount, startTimestamp, dailyBribesRevenue)
  })
  return { dailyBribesRevenue }
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  // Strategy B (slipstream): per-pool exact split.
  //   holders_per_token = gaugeFees(toBlock) - gaugeFees(fromBlock) + Σ CollectFees in [fromBlock, toBlock]
  //   total_per_token   = Σ (input-side amount × feeRate) over swaps in this pool
  //   supplySide_per_token = total_per_token − holders_per_token
  // gaugeFees resets when the gauge calls collectFees(); CollectFees event captures the drain.
  const dailyHoldersRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const { bribeSet } = await getGaugeMetadata(fetchOptions)

  let rawPools: Array<any> = []
  for (const factory of CONFIG.factories) {
    const factoryLogs = await getLogs({ target: factory.address, fromBlock: factory.fromBlock, toBlock, eventAbi: eventAbis.event_poolCreated, skipIndexer: factory.skipIndexer, cacheInCloud: true, })
    rawPools = rawPools.concat(factoryLogs)
  }

  const _pools = rawPools.map((i: any) => i.pool.toLowerCase())
  const [fees, gaugeFeesStart, gaugeFeesEnd] = await Promise.all([
    api.multiCall({ abi: abis.fee, calls: _pools }),
    fromApi.multiCall({ abi: abis.gaugeFees, calls: _pools, permitFailure: true }),
    api.multiCall({ abi: abis.gaugeFees, calls: _pools, permitFailure: true }),
  ])
  const aeroPoolSet = new Set<string>()
  const poolInfoMap = {} as any
  rawPools.forEach(({ token0, token1, pool }, index) => {
    pool = pool.toLowerCase()
    const fee = Number(fees[index]) / 1e6
    poolInfoMap[pool] = { token0, token1, fee }
    aeroPoolSet.add(pool)
  })

  // Per-pool, per-token input-only fee accumulators (fee taken on the input side
  // only — matches the on-chain accounting and is what totals must reconcile to
  // when split into holders + supplySide).
  const poolFeeTotals: Record<string, { fee0: number; fee1: number }> = {}

  const blockStep = 1000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = []
  const iface = new ethers.Interface([eventAbis.event_swap]);


  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock)
    ranges.push([startBlock, endBlock])
    startBlock += blockStep
  }

  let errorFound: any = false


  await PromisePool
    .withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]: any) => {
      if (errorFound) return;
      try {
        const logs = await fetchOptions.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          entireLog: true,
          skipCache: true,
        })
        sdk.log(`Aerodrome slipstream got logs (${logs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`)
        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase()
          if (!aeroPoolSet.has(pool)) return;
          const { token0, token1, fee } = poolInfoMap[pool]
          const parsedLog = iface.parseLog(log)
          const amount0 = Number(parsedLog!.args.amount0)
          const amount1 = Number(parsedLog!.args.amount1)
          addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
          // Fees are taken from the input side. amount0 > 0 means token0 was input.
          if (!poolFeeTotals[pool]) poolFeeTotals[pool] = { fee0: 0, fee1: 0 }
          if (amount0 > 0) poolFeeTotals[pool].fee0 += amount0 * fee
          if (amount1 > 0) poolFeeTotals[pool].fee1 += amount1 * fee
        })
      } catch (e) {
        errorFound = e
        throw e
      }
    })

  if (errorFound) throw errorFound

  // Drains of gaugeFees in [fromBlock, toBlock]: needed so gaugeFees(end) − gaugeFees(start)
  // doesn't go negative across an epoch boundary where collectFees() was called.
  const collectIface = new ethers.Interface([eventAbis.event_collect_fees])
  const collectLogs = await getLogs({
    noTarget: true,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.event_collect_fees,
    entireLog: true,
    skipCache: true,
  })
  const collectedByPool: Record<string, { c0: number; c1: number }> = {}
  for (const log of collectLogs as any[]) {
    const pool = String(log.address ?? log.source ?? '').toLowerCase()
    if (!aeroPoolSet.has(pool)) continue
    const parsed = collectIface.parseLog(log)
    if (!collectedByPool[pool]) collectedByPool[pool] = { c0: 0, c1: 0 }
    collectedByPool[pool].c0 += Number(parsed!.args.amount0)
    collectedByPool[pool].c1 += Number(parsed!.args.amount1)
  }

  // Roll up per-pool totals into the three balances.
  rawPools.forEach(({ token0, token1, pool }, index) => {
    pool = String(pool).toLowerCase()
    const totals = poolFeeTotals[pool]
    if (!totals || (totals.fee0 === 0 && totals.fee1 === 0)) return

    const start = gaugeFeesStart[index] ?? null
    const end = gaugeFeesEnd[index] ?? null
    const startToken0 = Number(start?.token0 ?? start?.[0] ?? 0)
    const startToken1 = Number(start?.token1 ?? start?.[1] ?? 0)
    const endToken0 = Number(end?.token0 ?? end?.[0] ?? 0)
    const endToken1 = Number(end?.token1 ?? end?.[1] ?? 0)
    const collected = collectedByPool[pool] ?? { c0: 0, c1: 0 }

    let holders0 = endToken0 - startToken0 + collected.c0
    let holders1 = endToken1 - startToken1 + collected.c1
    // Negative deltas can show up only from data noise (state read at a block past the
    // window's end, or a missed CollectFees log).  Clamp to [0, totals] so the breakdown
    // can't push supplySide negative.
    if (holders0 < 0) holders0 = 0
    if (holders1 < 0) holders1 = 0
    if (holders0 > totals.fee0) holders0 = totals.fee0
    if (holders1 > totals.fee1) holders1 = totals.fee1

    const supply0 = totals.fee0 - holders0
    const supply1 = totals.fee1 - holders1

    // Sum both sides per pool — fee0 is the input-side fees from token0-input swaps,
    // fee1 is from token1-input swaps; they're independent contributions and must
    // BOTH be priced and added.  addOneToken would drop one side because it's
    // designed for per-swap calls (where exactly one side carries the fee), not for
    // the per-pool rollup we have here after summing input-side fees separately.
    if (totals.fee0 > 0) dailyFees.add(token0, totals.fee0)
    if (totals.fee1 > 0) dailyFees.add(token1, totals.fee1)
    if (holders0 > 0) dailyHoldersRevenue.add(token0, holders0)
    if (holders1 > 0) dailyHoldersRevenue.add(token1, holders1)
    if (supply0 > 0) dailySupplySideRevenue.add(token0, supply0)
    if (supply1 > 0) dailySupplySideRevenue.add(token1, supply1)
  })

  const { dailyBribesRevenue } = await getBribes(fetchOptions, bribeSet)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyBribesRevenue,
  }
}

const methodology = {
  Fees: "Total swap fees paid by traders. Per-pool fee rate read from CLPool.fee() (tickSpacing-based default, customizable) applied to each swap's input amount.",
  Revenue: "veAERO holders' share of swap fees, equal to HoldersRevenue (Aerodrome's zero-leak model routes all protocol revenue to voters).",
  HoldersRevenue: "Sum of (a) staked-LP fees and (b) the unstaked-LP rake (CLFactory.getUnstakedFee, default 10% of unstaked share), both routed into the gauge's CLPool.gaugeFees() accumulator. Measured on-chain as gaugeFees(toBlock) − gaugeFees(fromBlock) plus CollectFees event amounts (which drain the accumulator each Voter.distribute call).",
  SupplySideRevenue: "Unstaked LPs' net share of swap fees after the rake, accruing via the pool's feeGrowthGlobal. Computed per pool as Fees − HoldersRevenue.",
  BribesRevenue: "External bribes deposited to BribeVotingReward contracts (NotifyReward events filtered to slipstream GaugeFactories). Pre-launch tokens are priced via hardcoded conversion rates until each token's cutoff timestamp; afterwards DefiLlama spot pricing is used.",
}

const breakdownMethodology = {
  Fees: {
    'Swap fees': 'All swap fees paid by traders on Aerodrome Slipstream pools.',
  },
  Revenue: {
    'Staked-LP fees + unstaked-LP rake': "Both flow into the gauge's gaugeFees accumulator and are distributed to veAERO voters via FeeVotingReward.",
  },
  HoldersRevenue: {
    'Staked-LP fees + unstaked-LP rake': "Both flow into the gauge's gaugeFees accumulator and are distributed to veAERO voters via FeeVotingReward.",
  },
  SupplySideRevenue: {
    'Unstaked-LP fees': "Unstaked LPs' pro-rata share of swap fees, net of the unstaked-LP rake redirected to the gauge.",
  },
  BribesRevenue: {
    'External bribes': "Token deposits to a pool's BribeVotingReward contract that veAERO voters claim by voting for the pool's gauge.",
  },
}

const adapters: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-05-03',
    }
  }
}
export default adapters;
