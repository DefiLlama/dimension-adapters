import fetchURL from "../utils/fetchURL"
import { FetchOptions } from "../adapters/types"

const API_URL = 'https://api.prod.paradex.trade/v1'
const PAGE_SIZE = 1000 // API maximum
const KLINES_LIMIT = 1000 // one-minute candles per klines request
const ONE_HOUR = 60 * 60
const ONE_DAY = 24 * ONE_HOUR

// Public stats dashboard: https://www.paradex.trade/stats
// Lifetime daily volume. Row format: [TRADE_DATE, PERP_VOLUME, PERP_OPTION_VOLUME, SPOT_VOLUME, OPTION_VOLUME, TOTAL_VOLUME, CUMULATIVE_VOLUME]
export const PARADEX_DAILY_VOLUME_CARD = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'

// The dashboard's hourly volume card was removed on 2026-10-31, so windows from then on are summed
// from the trades API. Older windows keep the daily cards: /markets drops delisted markets, so
// trades undercount older history.
export const PARADEX_TRADES_FROM = Date.UTC(2026, 9, 31) / 1000

export async function getParadexMarkets(assetKind: 'PERP' | 'SPOT' | 'OPTION'): Promise<any[]> {
  const { results } = await fetchURL(`${API_URL}/markets?asset_kind=${assetKind}`)
  if (!results?.length) throw new Error(`No ${assetKind} markets returned by the Paradex API`)
  return results
}

// Taker fills only. start_at is inclusive and end_at exclusive, matching [startTimestamp, endTimestamp).
// filter is `market=<symbol>`, or `base_asset=<asset>` for every option on that underlying.
export async function getParadexTrades(options: FetchOptions, filter: string): Promise<any[]> {
  const trades: any[] = []
  let cursor: string | null = null
  do {
    const url = `${API_URL}/trades?${filter}&start_at=${options.startTimestamp * 1000}&end_at=${options.endTimestamp * 1000}&page_size=${PAGE_SIZE}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
    const { results, next } = await fetchURL(url)
    if (!Array.isArray(results)) throw new Error(`Invalid Paradex trades response for ${filter}`)
    trades.push(...results)
    cursor = next
  } while (cursor)
  return trades
}

// Underlying price at the close of each minute in the window, keyed by minute start (ms).
export async function getParadexUnderlyingPrices(options: FetchOptions, symbol: string): Promise<Record<number, number>> {
  const prices: Record<number, number> = {}
  for (let start = options.startTimestamp; start < options.endTimestamp; start += KLINES_LIMIT * 60) {
    const end = Math.min(start + KLINES_LIMIT * 60, options.endTimestamp)
    const { results } = await fetchURL(`${API_URL}/markets/klines?symbol=${symbol}&resolution=1&start_at=${start * 1000}&end_at=${end * 1000}&price_kind=underlying`)
    if (!Array.isArray(results)) throw new Error(`Invalid Paradex klines response for ${symbol}`)
    for (const [timestamp, _open, _high, _low, close] of results) prices[timestamp] = Number(close)
  }
  return prices
}

// The daily cards have no hourly split: the whole UTC day is attributed to its first hour so hourly
// pulls sum to the daily total, and a whole-UTC-day window takes it once. Every other window is zero.
export function isParadexDailyCardSlot({ startTimestamp, endTimestamp }: FetchOptions): boolean {
  const secondsIntoDay = ((startTimestamp % ONE_DAY) + ONE_DAY) % ONE_DAY
  const startsAtUtcMidnight = secondsIntoDay <= 60 || secondsIntoDay >= ONE_DAY - 60
  const windowSeconds = endTimestamp - startTimestamp
  return startsAtUtcMidnight && (Math.abs(windowSeconds - ONE_HOUR) <= 60 || Math.abs(windowSeconds - ONE_DAY) <= 60)
}

export async function getParadexDailyCardValue(card: string, options: FetchOptions, columnIndex: number): Promise<number> {
  const { data: { rows } } = await fetchURL(card)
  const value = rows?.find((r: any[]) => r[0].slice(0, 10) === options.dateString)?.[columnIndex]
  if (value == null) throw new Error(`Missing Paradex dashboard value for ${options.dateString} (column ${columnIndex})`)
  return Number(value)
}
