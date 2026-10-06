import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Options notional - 7D hourly card, OPTIONS column (index 4), rolling 7-day window.
// Row format: [TRADE_HOUR, PERPS, PERP_OPTIONS, SPOT, OPTIONS, TOTAL]
const hourlyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36136/card/42538?parameters=%5B%5D'
// Options premium - 7D hourly card, Premium Volume (index 1), rolling 7-day window.
// Row format: [Hour, Premium Volume]
const hourlyPremiumEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/36169/card/42571?parameters=%5B%5D'

// Daily fallback for any refill older than the rolling hourly window. Same metrics at day
// grain, full history from 2026-03-25.
// Lifetime volume: OPTION_VOLUME (index 4). Row format: [TRADE_DATE, PERP_VOLUME, PERP_OPTION_VOLUME, SPOT_VOLUME, OPTION_VOLUME, TOTAL_VOLUME, CUMULATIVE_VOLUME]
const dailyVolumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/20065/card/21187?parameters=%5B%5D'
// Daily premium: Premium Volume (index 1). Row format: [Day, Premium Volume, Cumulative Premium Volume]
const dailyPremiumEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/28546/card/32935?parameters=%5B%5D'

const ONE_DAY = 24 * 60 * 60
const ONE_WEEK = 7 * ONE_DAY

const fetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp } = options

  const [volRes, premRes] = await Promise.all([
    fetchURL(hourlyVolumeEndpoint),
    fetchURL(hourlyPremiumEndpoint),
  ])
  const volRows: any[] = volRes?.data?.rows
  const premRows: any[] = premRes?.data?.rows
  if (!volRows?.length || !premRows?.length) throw new Error('No data returned from Paradex hourly options cards')

  // Sum every hourly row in the requested half-open window (fromTimestamp, toTimestamp].
  const inWindow = (r: any[]) => {
    const rowTimestamp = Date.parse(r?.[0]) / 1000
    return rowTimestamp > fromTimestamp && rowTimestamp <= toTimestamp
  }
  const volWindow = volRows.filter(inWindow)
  const premWindow = premRows.filter(inWindow)

  if (volWindow.length || premWindow.length) {
    return {
      // A missing hour means no trades in that hour - a true zero, not missing data.
      dailyNotionalVolume: volWindow.reduce((sum, r) => sum + Number(r[4] ?? 0), 0),
      dailyPremiumVolume: premWindow.reduce((sum, r) => sum + Number(r[1] ?? 0), 0),
    }
  }

  // No hourly rows in the window: either a genuine gap inside the window, or a refill older
  // than the rolling card. Only a full-day window can safely fall back to the daily cards -
  // a narrower window cannot, because the daily value is the whole day and summing it across
  // the day's hourly slices would multiply it.
  const oldestHour = Math.min(...volRows.map((r: any[]) => Date.parse(r[0]) / 1000))
  const weekAgo = Math.floor(Date.now() / 1000) - ONE_WEEK
  const olderThanWindow = toTimestamp <= oldestHour || toTimestamp < weekAgo

  if (!olderThanWindow) {
    throw new Error(`Paradex hourly options cards have no rows in (${fromTimestamp}, ${toTimestamp}]`)
  }
  if (toTimestamp - fromTimestamp < ONE_DAY - 1) {
    throw new Error('Paradex hourly options data does not cover this window and it is too narrow to fall back to the daily cards. Refill full days only (daily notional/premium cover history from 2026-03-25).')
  }

  const dayKey = new Date(Math.floor(toTimestamp / ONE_DAY) * ONE_DAY * 1000).toISOString().slice(0, 10)
  const [dVolRes, dPremRes] = await Promise.all([
    fetchURL(dailyVolumeEndpoint),
    fetchURL(dailyPremiumEndpoint),
  ])
  const notional = dVolRes?.data?.rows?.find((r: any[]) => r[0].slice(0, 10) === dayKey)?.[4]
  const premium = dPremRes?.data?.rows?.find((r: any[]) => r[0].slice(0, 10) === dayKey)?.[1]
  if (notional == null || premium == null)
    throw new Error(`Missing Paradex options data for ${dayKey}: notional=${notional} premium=${premium}`)

  return {
    dailyNotionalVolume: Number(notional),
    dailyPremiumVolume: Number(premium),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      // Full history start. Days inside the rolling hourly window are served hourly; older
      // full-day refills fall back to the daily cards.
      start: '2026-03-25',
    },
  },
}

export default adapter
