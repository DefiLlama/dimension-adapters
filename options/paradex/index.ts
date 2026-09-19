import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Options Daily Volume (notional) - rolling window of recent daily options volume
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/27263/card/32012?parameters=%5B%5D'
// Options Daily Premium - rolling window of recent daily options premium volume
const dailyPremiumEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/28546/card/32935?parameters=%5B%5D'
// Options Volume (24H) - the daily volume card excludes the current (incomplete) day, so today's notional comes from this rolling 24h card
const volume24hEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/27228/card/31946?parameters=%5B%5D'
// Lifetime Fees - daily fees broken down by product, of which OPTION_FEES is the options share
const dailyFeesEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20068/card/21188?parameters=%5B%5D'

interface DailyCache {
  [date: string]: { notional?: number, premium?: number, fees?: number }
}

let dailyCache: DailyCache | null = null

const fetchDailyCache = async (): Promise<DailyCache> => {
  if (dailyCache) return dailyCache
  const [volumeRes, premiumRes, feesRes] = await Promise.all([
    fetchURL(dailyVolumeEndpoint),
    fetchURL(dailyPremiumEndpoint),
    fetchURL(dailyFeesEndpoint),
  ])
  const cache: DailyCache = {}
  // Notional card row format: [DAY, VOLUME]
  for (const row of volumeRes.data.rows) {
    const date = row[0].slice(0, 10) // "2026-04-08T00:00:00Z" -> "2026-04-08"
    cache[date] = { notional: Number(row[1]) }
  }
  // Premium card row format: [DAY, PREMIUM_VOLUME, CUMULATIVE_PREMIUM_VOLUME]
  for (const row of premiumRes.data.rows) {
    const date = row[0].slice(0, 10)
    if (!cache[date]) cache[date] = {}
    cache[date].premium = Number(row[1])
  }
  // Fees card row format: [TRADE_DATE, PERP_FEES, PERP_OPTION_FEES, SPOT_FEES, OPTION_FEES, TOTAL_FEE, CUMULATIVE_FEES]
  for (const row of feesRes.data.rows) {
    const date = row[0].slice(0, 10)
    if (!cache[date]) cache[date] = {}
    cache[date].fees = Number(row[4] ?? 0)
  }
  dailyCache = cache
  return dailyCache
}

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options
  const cache = await fetchDailyCache()
  const dateKey = new Date(startOfDay * 1000).toISOString().slice(0, 10)
  const entry = cache[dateKey]
  const todayKey = new Date().toISOString().slice(0, 10)
  if (dateKey === todayKey) {
    // Row format: [VOLUME_24H, VOLUME_30D]
    const volume24hRes = await fetchURL(volume24hEndpoint)
    const notional = volume24hRes.data.rows?.[0]?.[0]
    const premium = entry?.premium
    if (notional == null || premium == null) throw new Error(`Missing Paradex options data for ${dateKey}: notional=${notional} premium=${premium}`)
    return {
      dailyNotionalVolume: Number(notional),
      dailyPremiumVolume: premium,
      dailyFees: entry?.fees,
      dailyUserFees: entry?.fees,
    }
  }
  if (entry?.notional == null || entry?.premium == null) throw new Error(`Missing Paradex options data for ${dateKey}: notional=${entry?.notional} premium=${entry?.premium}`)
  return {
    dailyNotionalVolume: entry.notional,
    dailyPremiumVolume: entry.premium,
    dailyFees: entry.fees,
    dailyUserFees: entry.fees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2026-03-25',
    },
  },
  methodology: {
    Fees: "Options trading fees paid by takers and makers on Paradex, taken from the OPTION_FEES breakdown of the public Paradex stats dashboard.",
    UserFees: "Options trading fees paid by users on Paradex.",
    NotionalVolume: "Notional value of options contracts traded on Paradex.",
    PremiumVolume: "Premium paid for options contracts traded on Paradex.",
  },
  // Paradex does not publish a supply-side/protocol split of its fees, so - as with
  // the Paradex perps adapter - dailyRevenue is deliberately not reported.
  skipBreakdownValidation: true,
}

export default adapter
