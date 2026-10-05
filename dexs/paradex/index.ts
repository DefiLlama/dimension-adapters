import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Paradex 48H Volume (Hourly) - one row per completed UTC hour.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
// Columns match the lifetime daily volume card (21187) exactly (verified 2026-10-04:
// hourly sum equals the daily PERP_VOLUME to the cent), so this is the same metric at
// hourly resolution. The card serves a rolling 48h window.
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  // The runner's window is (toTimestamp - 3600, toTimestamp]; toTimestamp is the last
  // second of the requested hour, so floor to the hour start (mirrors how startOfDay is
  // derived from toTimestamp for daily adapters).
  const hourStart = Math.floor(options.toTimestamp / 3600) * 3600

  const { data: { rows } } = await fetchURL(hourlyVolumeEndpoint)
  if (!rows || rows.length === 0) throw new Error('No data returned from Paradex hourly volume card')

  const hourKey = new Date(hourStart * 1000).toISOString().slice(0, 19) + 'Z' // "2026-10-03T08:00:00Z"
  const row = rows.find((r: any[]) => r?.[0] === hourKey)
  if (!row) throw new Error(`Paradex hourly card has no row for ${hourKey} (outside the 48h window)`)
  // A null sum means no perp trades in that hour - a true zero, not missing data.
  return { dailyVolume: Number(row[1] ?? 0) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2026-10-03',
    },
  },
}

export default adapter
