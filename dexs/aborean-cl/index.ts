import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";
import { handleBribeToken } from "../aborean/utils";

const CONFIG = {
  factory: '0x8cfE21F272FdFDdf42851f6282c0f998756eEf27',
  voter: '0xC0F53703e9f4b79fA2FB09a2aeBA487FA97729c9',
  GaugeFactory: '0xF0361d1aD99971791C002E9c281B18739e9abad8'
}


const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  event_gaugeCreated: 'event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)',
  event_notify_reward: 'event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)',
  event_claim_rewards: 'event ClaimRewards(address indexed from, address indexed reward, uint256 amount)',
  // Emitted by a pool when the gauge drains its accumulated gaugeFees.
  event_collect_fees: 'event CollectFees(address indexed recipient, uint128 amount0, uint128 amount1)',
}

const abis = {
  fee: 'uint256:fee',
  // Per-token swap fees waiting for the gauge to collect: the staked-liquidity share plus the
  // 10% unstaked-liquidity rake
  gaugeFees: 'function gaugeFees() view returns (uint128 token0, uint128 token1)',
}


const getBribes = async (fetchOptions: FetchOptions): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, getLogs, startTimestamp } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_notify_reward]);

  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await getLogs({ target: CONFIG.voter, fromBlock: 20524597, eventAbi: eventAbis.event_gaugeCreated, cacheInCloud: true, })
  if (!logs_gauge_created?.length) return { dailyBribesRevenue };

  const bribes_contract: string[] = logs_gauge_created
    .filter((log) => log[2].toLowerCase() === CONFIG.GaugeFactory.toLowerCase())
    .map((log) => log[4].toLowerCase())
  const bribeSet = new Set(bribes_contract)

  const logs = await getLogs({ noTarget: true, eventAbi: eventAbis.event_notify_reward, entireLog: true, })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return;
    const parsedLog = iface.parseLog(log)
    const token = parsedLog!.args.reward.toLowerCase()
    const amount = parsedLog!.args.amount

    // Try to handle pre-launch token conversion
    handleBribeToken(token, amount, startTimestamp, dailyBribesRevenue)
  })
  return { dailyBribesRevenue }
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, createBalances, getToBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const toBlock = await getToBlock()

  const rawPools = await getLogs({ target: CONFIG.factory, fromBlock: 20524597, toBlock, eventAbi: eventAbis.event_poolCreated, cacheInCloud: true, })
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

  // Per-pool, input-side fee accumulators (fee is charged on the input side only, matching the
  // on-chain accounting that the gaugeFees split has to reconcile against).
  const poolFeeTotals: Record<string, { fee0: number; fee1: number }> = {}
  const iface = new ethers.Interface([eventAbis.event_swap]);
  const logs = await getLogs({ noTarget: true, eventAbi: eventAbis.event_swap, entireLog: true, })
  logs.forEach((log: any) => {
    const pool = (log.address || log.source).toLowerCase()
    if (!aeroPoolSet.has(pool)) return;
    const { token0, token1, fee } = poolInfoMap[pool]
    const parsedLog = iface.parseLog(log)
    const amount0 = Number(parsedLog!.args.amount0)
    const amount1 = Number(parsedLog!.args.amount1)
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    if (!poolFeeTotals[pool]) poolFeeTotals[pool] = { fee0: 0, fee1: 0 }
    if (amount0 > 0) poolFeeTotals[pool].fee0 += amount0 * fee
    if (amount1 > 0) poolFeeTotals[pool].fee1 += amount1 * fee
  })

  // Drains of gaugeFees within the window, so the delta doesn't go negative when the gauge
  // collects mid-window (happens each epoch via Voter.distribute).
  const collectIface = new ethers.Interface([eventAbis.event_collect_fees])
  const collectLogs = await getLogs({ noTarget: true, eventAbi: eventAbis.event_collect_fees, entireLog: true, })
  const collectedByPool: Record<string, { c0: number; c1: number }> = {}
  for (const log of collectLogs as any[]) {
    const pool = String(log.address ?? log.source ?? '').toLowerCase()
    if (!aeroPoolSet.has(pool)) continue
    const parsed = collectIface.parseLog(log)
    if (!collectedByPool[pool]) collectedByPool[pool] = { c0: 0, c1: 0 }
    collectedByPool[pool].c0 += Number(parsed!.args.amount0)
    collectedByPool[pool].c1 += Number(parsed!.args.amount1)
  }

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
    // Clamp to [0, totals]: negatives only come from data noise (missed drain / state read past
    // the window end), and holders can never exceed the fees actually charged.
    if (holders0 < 0) holders0 = 0
    if (holders1 < 0) holders1 = 0
    if (holders0 > totals.fee0) holders0 = totals.fee0
    if (holders1 > totals.fee1) holders1 = totals.fee1

    const supply0 = totals.fee0 - holders0
    const supply1 = totals.fee1 - holders1

    // Both input sides are independent contributions after the per-pool rollup, so price and add
    // both (addOneToken would drop one side — it's for per-swap calls where one side carries the fee).
    if (totals.fee0 > 0) dailyFees.add(token0, totals.fee0, 'Token Swap Fees')
    if (totals.fee1 > 0) dailyFees.add(token1, totals.fee1, 'Token Swap Fees')
    if (holders0 > 0) dailyHoldersRevenue.add(token0, holders0, 'Swap Fees To Voters')
    if (holders1 > 0) dailyHoldersRevenue.add(token1, holders1, 'Swap Fees To Voters')
    if (supply0 > 0) dailySupplySideRevenue.add(token0, supply0, 'Swap Fees To LPs')
    if (supply1 > 0) dailySupplySideRevenue.add(token1, supply1, 'Swap Fees To LPs')
  })

  const { dailyBribesRevenue } = await getBribes(fetchOptions)
  const dailyRevenue = createBalances()

  dailyFees.add(dailyBribesRevenue, 'External Bribes')
  dailyRevenue.add(dailyHoldersRevenue, 'Swap Fees To Voters')
  dailyRevenue.add(dailyBribesRevenue, 'External Bribes To Voters')
  dailyHoldersRevenue.add(dailyBribesRevenue, 'External Bribes To Voters')

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: '2025-10-02',
  methodology: {
    Fees: "All swap fees paid by traders — each pool's fee rate applied to the amount swapped — plus external bribes deposited for veABX voters.",
    UserFees: "All swap fees paid by traders — each pool's fee rate applied to the amount swapped — plus external bribes deposited for veABX voters.",
    Revenue: "The swap fees that go to veABX voters plus external bribes. Liquidity providers' share of swap fees is excluded, as it is a cost to the protocol rather than revenue.",
    HoldersRevenue: "The voters' share of swap fees — all fees from staked liquidity plus a 10% cut of unstaked liquidity's fees — together with external bribes, all distributed to veABX voters.",
    SupplySideRevenue: "Swap fees kept by liquidity providers: unstaked positions keep 90% of their fees (the remaining 10% goes to voters), and pools without a gauge pay 100% of their fees to LPs.",
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by traders on Aborean concentrated liquidity pools.',
      'External Bribes': 'External bribes deposited for veABX voters.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by traders on Aborean concentrated liquidity pools.',
      'External Bribes': 'External bribes deposited for veABX voters.',
    },
    Revenue: {
      'Swap Fees To Voters': 'Swap fees routed to veABX voters: staked-liquidity fees plus the 10% rake on unstaked-liquidity fees.',
      'External Bribes To Voters': 'External bribes distributed to veABX voters.',
    },
    HoldersRevenue: {
      'Swap Fees To Voters': 'Swap fees routed to veABX voters: staked-liquidity fees plus the 10% rake on unstaked-liquidity fees.',
      'External Bribes To Voters': 'External bribes distributed to veABX voters.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Swap fees kept by liquidity providers — 90% of unstaked-position fees plus all fees from pools without a gauge.',
    },
  }
}
export default adapters;
