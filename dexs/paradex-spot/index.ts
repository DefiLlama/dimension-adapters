import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Paradex 7D Volume (Hourly) - one row per completed UTC hour, rolling 7-day window.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
// The SPOT column matches the lifetime daily volume card (21187) SPOT_VOLUME (verified
// 2026-10-04), so this is the same metric at hourly resolution.
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'

// Lifetime daily volume. Same dashboard card the perp adapter uses; SPOT_VOLUME is column 3.
// Use this for any refill older than the hourly card's rolling window.
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'

const ONE_WEEK = 7 * 24 * 60 * 60

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { data: { rows } } = await fetchURL(hourlyVolumeEndpoint)
  if (!rows || rows.length === 0) throw new Error('No data returned from Paradex hourly volume card')

  // See the perp adapter note on summing the requested window.
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
      throw new Error(`Paradex hourly volume endpoint does not support old refill (rolling 7-day window only). Use the lifetime daily volume card for the same SPOT_VOLUME metric: ${dailyVolumeEndpoint}`)
    }
    throw new Error(`Paradex hourly card has no rows in (${options.fromTimestamp}, ${options.toTimestamp}]`)
  }
  // A null sum means no spot trades in that hour - a true zero, not missing data.
  return { dailyVolume: windowRows.reduce((sum: number, r: any[]) => sum + Number(r[3] ?? 0), 0) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.PARADEX],
  fetch,
  start: '2026-02-04',
}

export default adapter;
