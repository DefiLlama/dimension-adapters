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
  if (!Number.isFinite(openInterest))
    throw new Error('BULK stats response has invalid open interest')
  return {
    openInterestAtEnd: openInterest,
    longOpenInterestAtEnd: openInterest,
    shortOpenInterestAtEnd: openInterest,
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
    OpenInterest: 'Current one-sided open interest across all BULK perpetual markets. The BULK API reports open interest from positive positions only; longs equal shorts, so the adapter shows that one-sided figure rather than doubling it as gross long-plus-short OI.',
  },
}

export default adapter
