import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Options Daily Volume (notional) - rolling window of recent daily options volume
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/27263/card/32012?parameters=%5B%5D'
// Options Daily Premium - rolling window of recent daily options premium volume
const dailyPremiumEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/28546/card/32935?parameters=%5B%5D'

interface DailyCache {
  [date: string]: { notional: number, premium: number }
}

let dailyCache: DailyCache | null = null

const fetchDailyCache = async (): Promise<DailyCache> => {
  if (dailyCache) return dailyCache
  const [volumeRes, premiumRes] = await Promise.all([
    fetchURL(dailyVolumeEndpoint),
    fetchURL(dailyPremiumEndpoint),
  ])
  const cache: DailyCache = {}
  // Notional card row format: [DAY, VOLUME]
  for (const row of volumeRes.data.rows) {
    const date = row[0].slice(0, 10) // "2026-04-08T00:00:00Z" -> "2026-04-08"
    cache[date] = { notional: Number(row[1] ?? 0), premium: 0 }
  }
  // Premium card row format: [DAY, PREMIUM_VOLUME, CUMULATIVE_PREMIUM_VOLUME]
  for (const row of premiumRes.data.rows) {
    const date = row[0].slice(0, 10)
    if (!cache[date]) cache[date] = { notional: 0, premium: 0 }
    cache[date].premium = Number(row[1] ?? 0)
  }
  dailyCache = cache
  return dailyCache
}

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options
  const cache = await fetchDailyCache()
  const dateKey = new Date(startOfDay * 1000).toISOString().slice(0, 10)
  const entry = cache[dateKey]
  if (!entry) throw new Error(`No Paradex options volume data for ${dateKey}`)
  return {
    dailyNotionalVolume: entry.notional,
    dailyPremiumVolume: entry.premium,
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
}

export default adapter
