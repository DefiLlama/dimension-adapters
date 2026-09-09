import { FetchOptions, FetchResultVolume, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'

const STATS_URL = 'https://mainnet-api1.bulk.trade/api/v1/stats?period=1d'
const MAX_STATS_AGE_MS = 20 * 60 * 1000

type StatsResponse = {
  timestamp?: unknown
  openInterest?: { totalUsd?: unknown }
}

async function fetch(options: FetchOptions): Promise<FetchResultVolume> {
  const response: StatsResponse = await fetchURL(STATS_URL)
  const timestamp = response.timestamp
  const openInterest = response.openInterest?.totalUsd
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)
    || Math.abs(Date.now() - timestamp) > MAX_STATS_AGE_MS
    || Math.abs(Date.now() - options.endTimestamp * 1000) > 24 * 60 * 60 * 1000)
    throw new Error('BULK stats response is stale')
  if (typeof openInterest !== 'number' || !Number.isFinite(openInterest) || openInterest < 0)
    throw new Error('BULK stats response has invalid open interest')
  if (!Number.isFinite(openInterest * 2))
    throw new Error('BULK stats response has invalid open interest')
  return {
    // The API's one-sided figure is the headline: aggregate longs equal aggregate shorts, so
    // reporting their sum would double-count.
    openInterestAtEnd: openInterest,
    longOpenInterestAtEnd: openInterest / 2,
    shortOpenInterestAtEnd: openInterest / 2,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BULK],
  runAtCurrTime: true,
  // Open interest is a point-in-time snapshot and must not be summed across hourly runs.
  pullHourly: false,
  methodology: {
    OpenInterest: 'Current open interest across all BULK perpetual markets, one-sided. The BULK API exposes one-sided open interest from positive positions; aggregate longs equal aggregate shorts, so the API value is reported as-is rather than summed across both sides.',
  },
}

export default adapter
