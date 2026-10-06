import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Paradex 7D Volume (Hourly) - one row per completed UTC hour, rolling 7-day window.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
// The SPOT column matches the lifetime daily volume card (21187) SPOT_VOLUME (verified
// 2026-10-04), so this is the same metric at hourly resolution.
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'

// Lifetime daily volume. Same dashboard card the perp adapter uses; SPOT_VOLUME is column 3.
// Row format: [TRADE_DATE, PERP_VOLUME, PERP_OPTION_VOLUME, SPOT_VOLUME, OPTION_VOLUME, TOTAL_VOLUME, CUMULATIVE_VOLUME]
// Used for any refill older than the hourly card's rolling window.
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'

const ONE_HOUR = 60 * 60
const ONE_DAY = 24 * ONE_HOUR
const SPOT_VOLUME_INDEX = 3

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { fromTimestamp, toTimestamp } = options
  const { data: { rows } } = await fetchURL(hourlyVolumeEndpoint)
  if (!rows || rows.length === 0) throw new Error('No data returned from Paradex hourly volume card')

  // See the perp adapter note on summing the requested window.
  const windowRows = rows.filter((r: any[]) => {
    const rowTimestamp = Date.parse(r?.[0]) / 1000
    return rowTimestamp > fromTimestamp && rowTimestamp <= toTimestamp
  })
  const coverageStart = Math.min(...rows.map((r: any[]) => Date.parse(r?.[0]) / 1000))
  // The runner's window is (fromTimestamp, toTimestamp]; a bucket stamped coverageStart covers
  // the hour starting there, so a request from coverageStart - 1 already includes it.
  if (fromTimestamp >= coverageStart - 1) {
    if (!windowRows.length) throw new Error(`Paradex hourly card has no rows in (${fromTimestamp}, ${toTimestamp}]`)
    // A null sum means no spot trades in that hour - a true zero, not missing data.
    return { dailyVolume: windowRows.reduce((sum: number, r: any[]) => sum + Number(r[SPOT_VOLUME_INDEX] ?? 0), 0) }
  }

  // Older than the rolling hourly window (~7 days): the daily card is the source.
  // Attribute the whole UTC day to its first hour so hourly pulls sum to the daily total.
  // Every other hour of that day is zero. A full UTC-day window (local daily test) takes the same value once.
  // A day that still overlaps the hourly card is not fully outside that week — its covered hours
  // are summed above, so this uncovered slice stays zero instead of adding the daily total again.
  const windowSeconds = toTimestamp - fromTimestamp
  const dayStart = Math.floor(toTimestamp / ONE_DAY) * ONE_DAY
  const dayFullyBeforeCoverage = dayStart + ONE_DAY <= coverageStart
  const isFirstUtcHour = windowSeconds === ONE_HOUR && (fromTimestamp + 1) % ONE_DAY === 0
  const isWholeUtcDay = windowSeconds === ONE_DAY && (toTimestamp + 1) % ONE_DAY === 0
  if (!dayFullyBeforeCoverage || (!isFirstUtcHour && !isWholeUtcDay)) {
    return { dailyVolume: 0 }
  }

  const dayKey = options.dateString
  const { data: { rows: dailyRows } } = await fetchURL(dailyVolumeEndpoint)
  const volume = dailyRows?.find((r: any[]) => r[0].slice(0, 10) === dayKey)?.[SPOT_VOLUME_INDEX]
  if (volume == null) throw new Error(`Missing Paradex spot volume for ${dayKey}`)
  return { dailyVolume: Number(volume) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.PARADEX],
  fetch,
  start: '2026-02-04',
}

export default adapter;
