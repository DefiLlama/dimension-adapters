import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { getCache, setCache } from '../../helpers/cache'
import { CHAIN } from '../../helpers/chains'
import { httpGet } from '../../utils/fetchURL'

const FEE_STATE_URL = 'https://mainnet-api1.bulk.trade/api/v1/feeState'
const CACHE_SCHEMA = 1
const ACCOUNTING_TOLERANCE = 1e-6

type FeeCounters = {
  slot: number
  settledFills: number
  totalMakerFees: number
  totalTakerFees: number
  totalProtocolSettlement: number
}

type FeePolicy = {
  tiers: { maker_bps: number }[]
}

type FeeScope = {
  instrument: string
  active_policy: FeePolicy | null
}

type FeeState = FeeCounters & {
  globalPolicyActive: boolean
  scopes: FeeScope[]
}

type FeeCache = {
  schema: number
  day: string
  baseline: FeeCounters
  latest: FeeCounters
}

function counters(state: FeeCounters): FeeCounters {
  return {
    slot: state.slot,
    settledFills: state.settledFills,
    totalMakerFees: state.totalMakerFees,
    totalTakerFees: state.totalTakerFees,
    totalProtocolSettlement: state.totalProtocolSettlement,
  }
}

function validateCounters(state: FeeCounters) {
  if (!Number.isSafeInteger(state.slot) || state.slot < 0
    || !Number.isSafeInteger(state.settledFills) || state.settledFills < 0
    || !Number.isFinite(state.totalMakerFees) || state.totalMakerFees < 0
    || !Number.isFinite(state.totalTakerFees) || state.totalTakerFees > 0
    || !Number.isFinite(state.totalProtocolSettlement))
    throw new Error('BULK feeState contains invalid counters')
  if (Math.abs(state.totalMakerFees + state.totalTakerFees + state.totalProtocolSettlement) > ACCOUNTING_TOLERANCE)
    throw new Error('BULK feeState accounting identity failed')
}

function validatePolicy(state: FeeState) {
  if (state.globalPolicyActive !== true || !Array.isArray(state.scopes) || !state.scopes.length)
    throw new Error('BULK feeState scopes are invalid')
  const globalPolicy = state.scopes.find(scope => scope?.instrument === 'global')?.active_policy
  if (!globalPolicy || !Array.isArray(globalPolicy.tiers) || !globalPolicy.tiers.length)
    throw new Error('BULK feeState global policy is invalid')
  for (const scope of state.scopes) {
    if (!scope || typeof scope.instrument !== 'string'
      || !Object.prototype.hasOwnProperty.call(scope, 'active_policy')
      || (scope.active_policy !== null && typeof scope.active_policy !== 'object'))
      throw new Error('BULK feeState scopes are invalid')
    const policy = scope.active_policy
    if (policy && (!Array.isArray(policy.tiers) || !policy.tiers.length
      || policy.tiers.some(tier => typeof tier?.maker_bps !== 'number' || !Number.isFinite(tier.maker_bps) || tier.maker_bps !== 0)))
      throw new Error('BULK fee adapter requires zero base maker fees')
  }
}

function validateProgress(previous: FeeCounters, current: FeeCounters) {
  if (current.slot < previous.slot || current.settledFills < previous.settledFills
    || current.totalMakerFees < previous.totalMakerFees
    || current.totalTakerFees > previous.totalTakerFees)
    throw new Error('BULK feeState counters regressed')
}

function deriveFeeWindow(current: FeeState, cached: FeeCache | undefined, day: string) {
  validateCounters(current)
  validatePolicy(current)
  const latest = counters(current)
  if (!cached)
    return {
      metrics: { fees: 0, supplySideRevenue: 0, revenue: 0 },
      cache: { schema: CACHE_SCHEMA, day, baseline: latest, latest },
    }
  if (cached.schema !== CACHE_SCHEMA || typeof cached.day !== 'string' || day < cached.day)
    throw new Error('BULK fee cache day regressed')
  validateCounters(cached.baseline)
  validateCounters(cached.latest)
  validateProgress(cached.baseline, cached.latest)
  validateProgress(cached.latest, latest)
  const baseline = day === cached.day ? cached.baseline : cached.latest
  const metrics = {
    fees: -(latest.totalTakerFees - baseline.totalTakerFees),
    supplySideRevenue: latest.totalMakerFees - baseline.totalMakerFees,
    revenue: latest.totalProtocolSettlement - baseline.totalProtocolSettlement,
  }
  if (Math.abs(metrics.fees - metrics.supplySideRevenue - metrics.revenue) > ACCOUNTING_TOLERANCE)
    throw new Error('BULK daily fee accounting identity failed')
  return {
    metrics,
    cache: { schema: CACHE_SCHEMA, day, baseline, latest },
  }
}

async function fetch(options: FetchOptions) {
  const state: FeeState = await httpGet(FEE_STATE_URL)
  const cached = await getCache('bulk-trade', 'fee-state-v1')
  const { metrics, cache } = deriveFeeWindow(state, Object.keys(cached).length ? cached as FeeCache : undefined, options.dateString)
  await setCache('bulk-trade', 'fee-state-v1', cache)

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  dailyFees.addUSDValue(metrics.fees, 'Taker Trading Fees')
  dailySupplySideRevenue.addUSDValue(metrics.supplySideRevenue, 'Trading Fees To Makers')
  dailyRevenue.addUSDValue(metrics.revenue, 'Trading Fees After Maker Rebates')
  return { dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue, dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BULK],
  start: '2026-09-05',
  runAtCurrTime: true,
  allowNegativeValue: true, // A carried rebate reserve can make net revenue negative for a sampling window.
  methodology: {
    Fees: 'Taker trading fees measured from daily changes in BULK mainnet cumulative fee settlement.',
    UserFees: 'Taker trading fees debited from users during the sampling window.',
    SupplySideRevenue: 'Realized trading-fee rebates credited to makers during the sampling window.',
    Revenue: 'Net fee settlement after realized maker rebates during the sampling window.',
  },
  breakdownMethodology: {
    Fees: { 'Taker Trading Fees': 'Taker trading fees charged during the sampling window.' },
    UserFees: { 'Taker Trading Fees': 'Taker trading fees debited from users during the sampling window.' },
    SupplySideRevenue: { 'Trading Fees To Makers': 'Realized trading-fee rebates credited to makers.' },
    Revenue: { 'Trading Fees After Maker Rebates': 'Net trading-fee settlement after realized maker rebates.' },
  },
}

export default adapter
