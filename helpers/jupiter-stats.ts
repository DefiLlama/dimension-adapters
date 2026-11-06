import { FetchOptions } from "../adapters/types"
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL"

// Jupiter's daily revenue by product and subproduct, from 2026-01-01.
const STATS_API = 'https://api.jup.ag/stats/v1/revenue'

export const JUPITER_STATS_API_START = '2026-01-01'
export const JUPITER_STATS_API_START_TS = 1767225600 // 2026-01-01

type StatsRow = {
  date: string
  product: string
  subproduct: string
  grossRevenueUsd: number | null
  netRevenueUsd: number | null
}

const dayCache: Record<string, Promise<{ asOf: string, data: StatsRow[] }>> = {}

// One call per day returns every subproduct, shared by all Jupiter adapters in the run.
async function getDay(day: string) {
  // Keyless calls are limited to 5 per 10 seconds; the fetch retries after a pause.
  if (!dayCache[day]) dayCache[day] = fetchURLAutoHandleRateLimit(`${STATS_API}?breakdown=subproduct&interval=daily&from=${day}&to=${day}`, 5)
    .catch((e: any) => { delete dayCache[day]; throw e })
  const res = await dayCache[day]
  if (!res?.asOf || !Array.isArray(res.data)) throw new Error(`Jupiter stats API: no response for ${day}`)
  // Released with a two-day lag; a day after asOf is not published yet.
  if (day > res.asOf) throw new Error(`Jupiter stats API: ${day} is not published yet (asOf ${res.asOf})`)
  return res.data
}

// Throws if the day is not published yet. Called before a Dune or Allium query so an unpublished day costs nothing.
export async function assertJupiterStatsPublished(options: FetchOptions) {
  await getDay(options.dateString)
}

type Labels = string | { fees: string, revenue: string, supplySide: string }

// Gross and net per subproduct for the day. A subproduct with no row on a published day had no revenue.
// A plain label is used for fees, revenue and supply side; an object gives each its own destination label.
export async function getJupiterStatsRevenue(options: FetchOptions, labels: Record<string, Labels>) {
  const rows = await getDay(options.dateString)
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const row of rows) {
    const label = labels[row.subproduct]
    if (!label) continue
    if (row.grossRevenueUsd === null || row.netRevenueUsd === null) throw new Error(`Jupiter stats API: null value for ${row.subproduct} on ${options.dateString}`)
    const l = typeof label === 'string' ? { fees: label, revenue: label, supplySide: label } : label
    dailyFees.addUSDValue(row.grossRevenueUsd, l.fees)
    dailyRevenue.addUSDValue(row.netRevenueUsd, l.revenue)
    dailySupplySideRevenue.addUSDValue(row.grossRevenueUsd - row.netRevenueUsd, l.supplySide)
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}
