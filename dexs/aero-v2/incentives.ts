import * as sdk from '@defillama/sdk'
import { FetchOptions } from '../../adapters/types'

// Shared by dexs/aero-v2 (basic pools) and dexs/aero-lite (Slipstream pools).

export const LIQUIDITY_PAYMENTS = 'Liquidity Payments'
export const LIQUIDITY_PAYMENTS_TO_HOLDERS = 'Liquidity Payments To sAERO Holders'

// Incentive programs funded by Aero itself are spending, not revenue:
const PROTOCOL_CREATORS = new Set([
  // protocol governance multisig: holds every pool factory, CL factory and pool tape admin role on all 7 chains
  '0x42255e3c2d0b71a0b006243148fdf1a71d054ce0',
  // Aero Foundation liquid incentive budget (Base): held the Aerodrome-era incentive AERO and upgraded it
  // (29.2M) at launch, which https://aero.xyz/aero-upgrade/ says funds the launch incentives
  '0x7269de76188e6597444d0859c4e5c336d3c39ddb',
])

const PRECISION = 10n ** 18n // ProtocolConstants.PRECISION: program rate = amount * PRECISION / duration
const PROGRAM = 'function incentive(uint256) view returns ((address token, uint256 amount, uint256 rate, uint48 start, uint48 end, address creator))'
const GLOBAL_POINT = 'function globalRewardPointHistory(uint256) view returns ((int128 bias, int128 slope, uint48 ts, uint128 permanentStakeBalance, uint48 zeroSupplySeconds))'
const PRIOR_INDEX = 'function getPriorSupplyIndex(uint256) view returns (uint256)'
const SUPPLY_AT = 'function supplyAt(uint256) view returns (uint256)'

// pool -> its gauge and rewards contract (VotingRewardsManager), from the FactoryRegistry the pool
// factory points to, at the api's block
export const getGauges = async (api: sdk.ChainApi, factory: string) => {
  const registry = await api.call({ target: factory, abi: 'address:factoryRegistry' })
  const gaugeFactories: string[] = await api.call({ target: registry, abi: 'address[]:gaugeFactories' })
  const gauges: string[] = (await api.multiCall({ target: registry, abi: 'function factoryToGauges(address) view returns (address[])', calls: gaugeFactories })).flat()
  const [pools, rewards] = await Promise.all([
    api.multiCall({ target: registry, abi: 'function gaugeToTarget(address) view returns (address)', calls: gauges }),
    api.multiCall({ target: registry, abi: 'function gaugeToRewards(address) view returns (address)', calls: gauges }),
  ])
  return new Map<string, { gauge: string; rewards: string }>(pools.map((pool: string, i: number) => [pool.toLowerCase(), { gauge: gauges[i].toLowerCase(), rewards: rewards[i] }]))
}

// Seconds of [s, e) in which the pool had allocation, counted the way the rewards contract counts
// them (verified source: RewardsLogicLibrary._zeroSupplySecondsInRange); the rest is swept back to
// the program creator.
const allocatedSeconds = async (api: sdk.ChainApi, spans: { rewards: string; s: number; e: number }[]) => {
  const at = (abi: string, param: (p: any, i: number) => any) => api.multiCall({ abi, calls: spans.map((p, i) => ({ target: p.rewards, params: [param(p, i)] })) })
  const [startIdx, endIdx, lastIdx] = await Promise.all([
    at(PRIOR_INDEX, (p) => p.s),
    at(PRIOR_INDEX, (p) => p.e),
    api.multiCall({ abi: 'uint256:globalCheckpointIndex', calls: spans.map((p) => p.rewards) }),
  ])
  const [startPt, nextPt, endPt] = await Promise.all([
    at(GLOBAL_POINT, (_, i) => startIdx[i]),
    at(GLOBAL_POINT, (_, i) => Math.min(Number(startIdx[i]) + 1, Number(lastIdx[i]))),
    at(GLOBAL_POINT, (_, i) => endIdx[i]),
  ])
  // a span that does not start on a checkpoint has a leading partial interval up to the next one
  const leadEnd = spans.map((p, i) => {
    if (Number(startPt[i].ts) >= p.s) return null
    const nextTs = Number(startIdx[i]) < Number(lastIdx[i]) ? Number(nextPt[i].ts) : Infinity
    return Math.min(p.e, nextTs)
  })
  const [leadSupply, endSupply] = await Promise.all([
    at(SUPPLY_AT, (p, i) => (leadEnd[i] ?? p.e) - 1),
    at(SUPPLY_AT, (p) => p.e - 1),
  ])
  return spans.map((p, i) => {
    let s = p.s, zero = 0, aligned = startPt[i]
    const lead = leadEnd[i]
    if (lead !== null) {
      if (Number(leadSupply[i]) === 0) zero += lead - s
      s = lead
      if (p.e <= s) return p.e - p.s - zero
      aligned = nextPt[i]
    }
    const alignedEnd = Number(endPt[i].ts)
    if (alignedEnd > s) zero += Number(endPt[i].zeroSupplySeconds) - Number(aligned.zeroSupplySeconds)
    if (alignedEnd < p.e && Number(endSupply[i]) === 0) zero += p.e - alignedEnd
    return p.e - p.s - zero
  })
}

// Incentive programs (Liquidity Payments; Launch Payments use the same contract) stream amount /
// duration per second to the sAERO holders allocating to the pool (verified source:
// V3/src/rewards/IncentiveStreaming.sol). Counted as they stream, without the seconds the creator
// can sweep back and without programs funded by Aero itself.
export const addIncentives = async (options: FetchOptions, rewardsContracts: string[], { dailyFees, dailyRevenue }: any) => {
  const { api } = options
  if (!rewardsContracts.length) return
  // runner windows are [startTimestamp + 1, endTimestamp)
  const from = options.startTimestamp + 1, to = options.endTimestamp

  const counts = await api.multiCall({ abi: 'uint256:incentiveCount', calls: rewardsContracts })
  // program ids start at 1
  const calls = rewardsContracts.flatMap((target, i) => Array.from({ length: Number(counts[i]) }, (_, k) => ({ target, params: [k + 1] })))
  const spans = (await api.multiCall({ abi: PROGRAM, calls }))
    .map((p: any, i: number) => ({ token: p.token, rate: p.rate, creator: p.creator.toLowerCase(), rewards: calls[i].target, s: Math.max(from, Number(p.start)), e: Math.min(to, Number(p.end)) }))
    .filter((p: any) => p.s < p.e && !PROTOCOL_CREATORS.has(p.creator))
  if (!spans.length) return

  const seconds = await allocatedSeconds(api, spans)
  spans.forEach((p: any, i: number) => {
    const amount = BigInt(p.rate) * BigInt(seconds[i]) / PRECISION
    if (amount <= 0n) return
    dailyFees.add(p.token, amount, LIQUIDITY_PAYMENTS)
    dailyRevenue.add(p.token, amount, LIQUIDITY_PAYMENTS_TO_HOLDERS)
  })
}
