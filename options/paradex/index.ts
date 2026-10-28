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

const ONE_HOUR = 60 * 60
const ONE_DAY = 24 * ONE_HOUR

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

  // The hourly cards cover a rolling window. Only trust hourly sums when the whole requested
  // window sits inside that coverage - otherwise the window edge would yield a partial total
  // (a missing hour inside coverage is a true zero, but an hour before coverage is not data).
  // Take the later of the two cards' first rows: a window must be covered by BOTH cards.
  const coverageStart = Math.max(
    Math.min(...volRows.map((r: any[]) => Date.parse(r[0]) / 1000)),
    Math.min(...premRows.map((r: any[]) => Date.parse(r[0]) / 1000)),
  )
  // The runner's window is (fromTimestamp, toTimestamp]; a bucket stamped coverageStart covers
  // the hour starting there, so a request from coverageStart - 1 already includes it.
  if (fromTimestamp >= coverageStart - 1) {
    return {
      // A missing hour means no trades in that hour - a true zero, not missing data.
      dailyNotionalVolume: volWindow.reduce((sum, r) => sum + Number(r[4] ?? 0), 0),
      dailyPremiumVolume: premWindow.reduce((sum, r) => sum + Number(r[1] ?? 0), 0),
    }
  }

  // Older than the rolling hourly window (~7 days): the daily cards are the source.
  // Attribute the whole UTC day to its first hour so hourly pulls sum to the daily total.
  // Every other hour of that day is zero. A full UTC-day window (local daily test) takes the same value once.
  // A day that still overlaps the hourly cards is not fully outside that week — its covered hours
  // are summed above, so this uncovered slice stays zero instead of adding the daily total again.
  const windowSeconds = toTimestamp - fromTimestamp
  const near = (delta: number) => Math.abs(delta) <= 1
  const secondsIntoDay = ((fromTimestamp % ONE_DAY) + ONE_DAY) % ONE_DAY
  const startsAtUtcMidnight = secondsIntoDay <= 60 || secondsIntoDay >= ONE_DAY - 60
  // A `to` that lands exactly on midnight is the exclusive end of the previous day.
  const dayStart = Math.floor((toTimestamp - 1) / ONE_DAY) * ONE_DAY
  const dayFullyBeforeCoverage = dayStart + ONE_DAY <= coverageStart
  const isFirstUtcHour = near(windowSeconds - ONE_HOUR) && startsAtUtcMidnight
  const isWholeUtcDay = near(windowSeconds - ONE_DAY) && startsAtUtcMidnight
  if (!dayFullyBeforeCoverage || (!isFirstUtcHour && !isWholeUtcDay)) {
    return {
      dailyNotionalVolume: 0,
      dailyPremiumVolume: 0,
    }
  }

  const dayKey = options.dateString
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
      // days fall back to the daily cards on the first UTC hour (other hours are zero).
      start: '2026-03-25',
    },
  },
}

export default adapter