import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Options Daily Volume - rolling window of recent daily options volume
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/27263/card/32012?parameters=%5B%5D'

interface DailyVolumeCache {
  [date: string]: number
}

let dailyVolumeCache: DailyVolumeCache | null = null

const fetchDailyVolumeCache = async (): Promise<DailyVolumeCache> => {
  if (dailyVolumeCache) return dailyVolumeCache
  const { data: { rows } } = await fetchURL(dailyVolumeEndpoint)
  dailyVolumeCache = {}
  for (const row of rows) {
    // Row format: [DAY, VOLUME]
    const date = row[0].slice(0, 10) // "2026-04-08T00:00:00Z" -> "2026-04-08"
    dailyVolumeCache[date] = Number(row[1] ?? 0)
  }
  return dailyVolumeCache
}

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options
  const cache = await fetchDailyVolumeCache()
  const dateKey = new Date(startOfDay * 1000).toISOString().slice(0, 10)
  const dailyNotionalVolume = cache[dateKey]
  if (dailyNotionalVolume === undefined) throw new Error(`No Paradex options volume data for ${dateKey}`)
  return { dailyNotionalVolume }
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
