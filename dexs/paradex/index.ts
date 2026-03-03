import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Rolling 24H volume - for current day
const rolling24hEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/9308/card/8353?parameters=%5B%5D'
// Lifetime Volume - for historical daily volumes (has data from 2023-08-25)
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'

interface DailyVolumeCache {
  [date: string]: number
}

let dailyVolumeCache: DailyVolumeCache | null = null

const fetchDailyVolumeCache = async (): Promise<DailyVolumeCache> => {
  if (dailyVolumeCache) return dailyVolumeCache
  const { data: { rows } } = await fetchURL(dailyVolumeEndpoint)
  dailyVolumeCache = {}
  for (const row of rows) {
    // Row format: [TRADE_DATE, PERP_VOLUME, OPTION_VOLUME, TOTAL_VOLUME, CUMULATIVE_VOLUME]
    const date = row[0].slice(0, 10) // "2026-01-19T00:00:00Z" -> "2026-01-19"
    const perpVolume = Number(row[1] ?? 0)
    dailyVolumeCache[date] = perpVolume
  }
  return dailyVolumeCache
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { startOfDay, endTimestamp } = options
  const todayStartOfDay = Math.floor(new Date(new Date(endTimestamp * 1000).toISOString().slice(0, 10)).getTime() / 1000)
  const isCurrentDay = startOfDay === todayStartOfDay

  if (isCurrentDay) {
    // Use rolling 24h volume for current day
    const { data: { rows } } = await fetchURL(rolling24hEndpoint)
    if (!rows || rows.length === 0) throw new Error('No data returned from API')
    return { dailyVolume: Number(rows[0][0] ?? 0) }
  }

  // Use historical daily volume for past dates
  // The chart uses TRADE_DATE which is the date trades occurred (startOfDay)
  const cache = await fetchDailyVolumeCache()
  const dateKey = new Date(startOfDay * 1000).toISOString().slice(0, 10)
  const dailyVolume = cache[dateKey]
  if (dailyVolume === undefined) throw new Error(`No historical data for ${dateKey}`)
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
}

export default adapter 