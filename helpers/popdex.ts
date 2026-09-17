import { httpGet } from '../utils/fetchURL'

// Published Morph Tachyon precompile addresses for a future on-chain fallback:
// https://popdex.xyz/docs/product-docs/chain/smart-contracts
//   Order    0x0000000000000000000000000000000000001000
//   Builder  0x0000000000000000000000000000000000001012
//   Referral 0x0000000000000000000000000000000000001011
// Fee semantics: https://popdex.xyz/docs/product-docs/trading/fees

// Public mainnet REST endpoint supplied by PopDEX.
const API_BASE = 'https://api.popdex.ai/api/v1/public'
const EPS = 0.0001 // absolute USD; 1e-6 false-fails once daily fees exceed ~1e8
// Tickers are documented as real-time data; fail rather than store a stale snapshot.
// https://popdex.xyz/docs/api/common/market/Get-Tickers
const OI_MAX_AGE_MS = 60 * 60 * 1000
const OI_FUTURE_TOLERANCE_MS = 1000 // tolerate only sub-second clock skew between the API host and runner

const METRIC_KEYS = [
  'volume', 'fees', 'tradingFee', 'builderFee', 'makerRebate', 'referralRebate',
  'traderRewards', 'supplySideRevenue', 'revenue', 'liquidationVolume',
] as const

type PerpsMetrics = Record<typeof METRIC_KEYS[number], number>

function parseAmount(raw: unknown, field: string): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`popdex: ${field} is not a numeric string: ${JSON.stringify(raw)}`)
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`popdex: ${field} is not finite: ${raw}`)
  return n
}

function assertClose(actual: number, expected: number, what: string) {
  if (Math.abs(actual - expected) > EPS) {
    throw new Error(`popdex invariant failed: ${what} (${actual} vs ${expected})`)
  }
}

/** The runner's startTimestamp is one second before the hour. Ceil it.
 * endTimestamp is already the next hour boundary. */
export function perpsWindowMs(options: { startTimestamp: number, endTimestamp: number }): { startTime: number, endTime: number } {
  const startSec = Math.ceil(options.startTimestamp / 3600) * 3600
  const endSec = options.endTimestamp
  if (startSec % 3600 !== 0 || endSec % 3600 !== 0 || startSec >= endSec) {
    throw new Error(`popdex: window is not hour-aligned: ${startSec} -> ${endSec}`)
  }
  return { startTime: startSec * 1000, endTime: endSec * 1000 }
}

export async function fetchPerpsMetrics(startTimeMs: number, endTimeMs: number): Promise<PerpsMetrics> {
  const url = `${API_BASE}/perps-metrics?startTime=${startTimeMs}&endTime=${endTimeMs}`
  const res = await httpGet(url)
  if (String(res?.code) !== '200') throw new Error(`popdex perps-metrics: code ${res?.code} msg ${res?.msg} (${url})`)
  const data = res?.data
  if (!data || typeof data !== 'object') throw new Error(`popdex perps-metrics: missing data (${url})`)
  if (Number(data.startTime) !== startTimeMs || Number(data.endTime) !== endTimeMs) {
    throw new Error(`popdex perps-metrics: echoed ${data.startTime}-${data.endTime}, requested ${startTimeMs}-${endTimeMs}`)
  }

  const m = {} as PerpsMetrics
  for (const key of METRIC_KEYS) m[key] = parseAmount(data[key], key)

  assertClose(m.fees, m.tradingFee + m.builderFee, 'fees = tradingFee + builderFee')
  assertClose(m.supplySideRevenue, m.makerRebate + m.referralRebate + m.builderFee + m.traderRewards,
    'supplySideRevenue = makerRebate + referralRebate + builderFee + traderRewards')
  assertClose(m.revenue, m.fees - m.supplySideRevenue, 'revenue = fees - supplySideRevenue')
  for (const key of METRIC_KEYS) {
    if (key === 'revenue') continue
    if (m[key] < -EPS) throw new Error(`popdex perps-metrics: ${key} is negative: ${m[key]}`)
  }
  return m
}

export async function fetchOpenInterestUsd(): Promise<number> {
  const limit = 100
  let cursor = '0'
  const rows: any[] = []
  let total: number | undefined

  // The cap bounds the walk. Exiting because the cap was hit, rather than
  // because a short page arrived, means the sum is partial and must not be stored.
  let finished = false
  for (let page = 0; page < 1000; page++) {
    const url = `${API_BASE}/market/tickers?category=Futures&limit=${limit}&cursor=${cursor}`
    const res = await httpGet(url)
    if (String(res?.code) !== '200') throw new Error(`popdex tickers: code ${res?.code} msg ${res?.msg}`)
    if (!Array.isArray(res?.data)) {
      throw new Error(`popdex tickers: data is not an array: ${JSON.stringify(res?.data)}`)
    }
    const data: any[] = res.data
    if (res?.total !== undefined && res?.total !== null && res?.total !== '') total = Number(res.total)
    rows.push(...data)
    if (data.length === 0 || data.length < limit) {
      finished = true
      break
    }
    if (String(res?.cursor) === cursor) throw new Error('popdex tickers: cursor did not advance while the page was full')
    cursor = String(res.cursor)
  }
  if (!finished) throw new Error('popdex tickers: page cap reached before the walk finished')
  if (total !== undefined && rows.length !== total) {
    throw new Error(`popdex tickers: received ${rows.length} rows, total is ${total}`)
  }

  let usd = 0
  const now = Date.now()
  let futuresRows = 0
  const symbols = new Set<string>()
  for (const row of rows) {
    if (String(row.category).toLowerCase() !== 'futures') continue
    futuresRows++
    if (typeof row.symbol !== 'string' || row.symbol.trim() === '') {
      throw new Error(`popdex tickers: futures row has invalid symbol ${JSON.stringify(row.symbol)}`)
    }
    const symbol = row.symbol.trim()
    if (symbols.has(symbol)) throw new Error(`popdex tickers: duplicate symbol ${symbol}`)
    symbols.add(symbol)
    const oi = parseAmount(row.openInterest, `openInterest for ${symbol}`)
    if (oi < 0) throw new Error(`popdex tickers: bad openInterest for ${symbol}: ${row.openInterest}`)
    const updated = Number(row.updatedTime)
    if (!Number.isFinite(updated) || updated - now > OI_FUTURE_TOLERANCE_MS || now - updated > OI_MAX_AGE_MS) {
      throw new Error(`popdex tickers: ${symbol} has invalid updatedTime ${row.updatedTime}`)
    }
    if (oi === 0) continue
    const mark = Number(row.markPrice)
    if (!Number.isFinite(mark) || mark <= 0) {
      throw new Error(`popdex tickers: ${symbol} openInterest ${oi} has markPrice ${row.markPrice}`)
    }
    usd += oi * mark
  }
  if (futuresRows === 0) throw new Error('popdex tickers: snapshot contains no futures rows')
  return usd
}
