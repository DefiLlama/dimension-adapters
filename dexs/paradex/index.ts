import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Paradex 7D Volume (Hourly) - one row per completed UTC hour, rolling 7-day window.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
// This listing is perps volume only (the PERPS column); spot and options are separate
// listings. Verified against the daily lifetime card on 2026-10-04: the hourly PERPS
// sums to the daily PERP_VOLUME to the cent. The card is used rather than
// api.prod.paradex.trade because the public candle API 404s for delisted markets and
// therefore undercounts history (up to ~10% on older days).
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'

// Lifetime daily volume. TOTAL_VOLUME is the same whole-exchange metric as the hourly TOTAL column.
// Use this for any refill older than the hourly card's rolling window.
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'

const ONE_WEEK = 7 * 24 * 60 * 60

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { data: { rows } } = await fetchURL(hourlyVolumeEndpoint)
  if (!rows || rows.length === 0) throw new Error('No data returned from Paradex hourly volume card')

  // Sum every hourly row in the requested half-open window (fromTimestamp, toTimestamp].
  // The server pulls one hour at a time, but the test harness passes a wider window.
  const windowRows = rows.filter((r: any[]) => {
    const rowTimestamp = Date.parse(r?.[0]) / 1000
    return rowTimestamp > options.fromTimestamp && rowTimestamp <= options.toTimestamp
  })
  if (!windowRows.length) {
    const oldestHour = Math.min(...rows.map((r: any[]) => Date.parse(r?.[0]) / 1000))
    const weekAgo = Math.floor(Date.now() / 1000) - ONE_WEEK
    // The hourly card drops anything outside its rolling 7-day window. A missing day
    // older than that is not a zero-volume day.
    if (options.toTimestamp <= oldestHour || options.toTimestamp < weekAgo) {
      throw new Error(`Paradex hourly volume endpoint does not support old refill (rolling 7-day window only). Use the lifetime daily volume card for the same TOTAL_VOLUME metric: ${dailyVolumeEndpoint}`)
    }
    throw new Error(`Paradex hourly card has no rows in (${options.fromTimestamp}, ${options.toTimestamp}]`)
  }
  // A null sum means no perp trades in that hour - a true zero, not missing data.
  // Column 1 is PERPS volume.
  return { dailyVolume: windowRows.reduce((sum: number, r: any[]) => sum + Number(r[1] ?? 0), 0) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
}

export default adapter
