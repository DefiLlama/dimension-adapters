import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Paradex 7D Volume (Hourly) - one row per completed UTC hour, rolling 7-day window.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
// The listing is whole-exchange volume (perps + spot + options), which is the TOTAL
// column. Verified against the daily lifetime card (21187) on 2026-10-04: the hourly
// TOTAL sums to the daily TOTAL_VOLUME to the cent. The card is used rather than
// api.prod.paradex.trade because the public candle API 404s for delisted markets and
// therefore undercounts history (up to ~10% on older days).
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { data: { rows } } = await fetchURL(hourlyVolumeEndpoint)
  if (!rows || rows.length === 0) throw new Error('No data returned from Paradex hourly volume card')

  // Sum every hourly row in the requested half-open window (fromTimestamp, toTimestamp].
  // The server pulls one hour at a time, but the test harness passes a wider window.
  const windowRows = rows.filter((r: any[]) => {
    const rowTimestamp = Date.parse(r?.[0]) / 1000
    return rowTimestamp > options.fromTimestamp && rowTimestamp <= options.toTimestamp
  })
  if (!windowRows.length) throw new Error(`Paradex hourly card has no rows in (${options.fromTimestamp}, ${options.toTimestamp}]`)
  // A null sum means no trades in that hour - a true zero, not missing data.
  // Column 5 is TOTAL (perps + spot + options): the whole-exchange volume for the listing.
  return { dailyVolume: windowRows.reduce((sum: number, r: any[]) => sum + Number(r[5] ?? 0), 0) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      // The card is a rolling 7-day window, so `start` must sit inside it at deploy time or
      // the initial refill's first hours throw. Set to a day inside the current window; move
      // it forward if the merge is delayed beyond the window.
      start: '2026-10-04',
    },
  },
}

export default adapter
