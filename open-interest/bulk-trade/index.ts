import { FetchOptions, FetchResultVolume, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { httpGet } from '../../utils/fetchURL'

const STATS_URL = 'https://mainnet-api1.bulk.trade/api/v1/stats?period=1d'
const MAX_STATS_AGE_MS = 20 * 60 * 1000

type StatsResponse = {
  timestamp?: unknown
  openInterest?: { totalUsd?: unknown }
}

async function fetch(_options: FetchOptions): Promise<FetchResultVolume> {
  const response: StatsResponse = await httpGet(STATS_URL)
  const timestamp = response.timestamp
  const openInterest = response.openInterest?.totalUsd
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_STATS_AGE_MS)
    throw new Error('BULK stats response is stale')
  if (typeof openInterest !== 'number' || !Number.isFinite(openInterest) || openInterest < 0)
    throw new Error('BULK stats response has invalid open interest')
  if (!Number.isFinite(openInterest * 2))
    throw new Error('BULK stats response has invalid open interest')
  return {
    openInterestAtEnd: openInterest * 2,
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
    OpenInterest: 'Current gross long-plus-short open interest across all BULK perpetual markets. The BULK API exposes one-sided open interest from positive positions; aggregate longs equal aggregate shorts, so the adapter reports the API value for each side and their sum as gross open interest.',
  },
}

export default adapter
