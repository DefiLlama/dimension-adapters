import ADDRESSES from '../../helpers/coreAssets.json'
// Changes to this helper's revenue logic require further approval before merging:
// a Trueo market depends on the Aero revenue it feeds (aero-v2, aero-lite).

import * as sdk from '@defillama/sdk'
import { FetchOptions } from '../../adapters/types'
import { isCoreAsset } from '../../helpers/prices'

// Shared by dexs/aero-v2 (basic pools) and dexs/aero-lite (Slipstream pools).

// Aero calls bribes Liquidity Payments (and Launch Payments when funded at a token launch, same
// contract). Same labels as the legacy Aerodrome adapters, so the Aero family breaks down the same way.
export const BRIBES = 'External Bribes Rewards'
export const BRIBES_TO_HOLDERS = 'External Bribes Revenue'

// AERO (Base) and xAERO (each chain's receipt token, redeemable 1:1) have no price feed yet. The
// upgrade converted Aerodrome AERO 1:1 (https://aero.xyz/aero-upgrade/), so both are valued at the
// Aerodrome AERO price. Addresses: https://app.aero.xyz/docs/security/
const AERODROME_AERO = 'base:' + ADDRESSES.base.AERO
const AERO_TOKENS = new Set([
  'base:0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee', // AERO
  'base:0x6cdda0e730744dc6ff67654b35350adad05ecee7', // xAERO
  'optimism:0xbdeaea5205d16f34cb40038052d91235d87b4c54',
  'arbitrum:0x436a085b2751cb87db270ffa66f8d698f87bec82',
  'ethereum:0x9e148c5716b5aadcfd3b71ceae9ee7a9e22c29e2',
  'ink:0x9e148c5716b5aadcfd3b71ceae9ee7a9e22c29e2',
  'robinhood:0x9e148c5716b5aadcfd3b71ceae9ee7a9e22c29e2',
  'arc:0x20077cc0d5e385a0fe9c91bbc7dc744f51559307',
])
const isAero = (chain: string, token: string) => AERO_TOKENS.has(`${chain}:${token.toLowerCase()}`)
// a token we know how to value: a core asset, or AERO/xAERO through the Aerodrome AERO price
const isKnown = (chain: string, token: string) => isCoreAsset(chain, token) || isAero(chain, token)

export const addAmount = (balances: sdk.Balances, chain: string, token: string, amount: bigint, label?: string) => {
  if (isAero(chain, token)) balances.add(AERODROME_AERO, amount, { label, skipChain: true })
  else balances.add(token, amount, label)
}

// The side a pool is valued on: a core asset first, then AERO/xAERO, else token1 (as addOneToken).
const valueSide = (chain: string, tokens: string[]) =>
  isCoreAsset(chain, tokens[0]) ? 0 : isCoreAsset(chain, tokens[1]) ? 1 : isAero(chain, tokens[0]) ? 0 : 1

// Volume counts one side of each swap: amounts[k] is the swap's (absolute) amount of token k.
export const addVolume = (balances: sdk.Balances, chain: string, tokens: string[], amounts: bigint[]) => {
  const k = valueSide(chain, tokens)
  addAmount(balances, chain, tokens[k], amounts[k])
}

// Per pool, per input token k: total input of token k and output of the other token on those swaps.
export type SwapFlow = { in: bigint[]; outOther: bigint[] }
export const newFlow = (): SwapFlow => ({ in: [0n, 0n], outOther: [0n, 0n] })

// Adds a fee paid in token k and its split. A fee in a token we cannot value (a launch token, say) is
// moved to the pool's other token when that one is known, at the rate of the swaps paying it
// (fee / input * output), so it still counts.
export const addPoolFee = (chain: string, tokens: string[], k: number, flow: SwapFlow, parts: [sdk.Balances, bigint, string][]) => {
  const o = 1 - k
  const convert = !isKnown(chain, tokens[k]) && isKnown(chain, tokens[o]) && flow.in[k] > 0n
  for (const [balances, amount, label] of parts) {
    if (amount <= 0n) continue
    if (convert) addAmount(balances, chain, tokens[o], amount * flow.outOther[k] / flow.in[k], label)
    else addAmount(balances, chain, tokens[k], amount, label)
  }
}

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

// Bribe programs stream amount / duration per second to the sAERO holders allocating to the pool
// (verified source: V3/src/rewards/IncentiveStreaming.sol). Counted as they stream, without the
// seconds the creator can sweep back. Programs funded by Aero itself count too: they carry value
// over from the legacy pools to the sAERO holders.
export const addBribes = async (options: FetchOptions, rewardsContracts: string[], { dailyFees, dailyRevenue }: any) => {
  const { api, chain } = options
  if (!rewardsContracts.length) return
  // runner windows are [startTimestamp + 1, endTimestamp)
  const from = options.startTimestamp + 1, to = options.endTimestamp

  const counts = await api.multiCall({ abi: 'uint256:incentiveCount', calls: rewardsContracts })
  // program ids start at 1
  const calls = rewardsContracts.flatMap((target, i) => Array.from({ length: Number(counts[i]) }, (_, k) => ({ target, params: [k + 1] })))
  const spans = (await api.multiCall({ abi: PROGRAM, calls }))
    .map((p: any, i: number) => ({ token: p.token, rate: p.rate, rewards: calls[i].target, s: Math.max(from, Number(p.start)), e: Math.min(to, Number(p.end)) }))
    .filter((p: any) => p.s < p.e)
  if (!spans.length) return

  const seconds = await allocatedSeconds(api, spans)
  spans.forEach((p: any, i: number) => {
    const amount = BigInt(p.rate) * BigInt(seconds[i]) / PRECISION
    if (amount <= 0n) return
    addAmount(dailyFees, chain, p.token, amount, BRIBES)
    addAmount(dailyRevenue, chain, p.token, amount, BRIBES_TO_HOLDERS)
  })
}

