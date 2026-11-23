import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { fetchOpenInterestUsd } from '../helpers/popdex'

const fetch = async (options: FetchOptions) => {
  const usd = await fetchOpenInterestUsd()
  const openInterestAtEnd = options.createBalances()
  openInterestAtEnd.addUSDValue(usd)
  return { openInterestAtEnd }
}

const adapter: SimpleAdapter = {
  version: 2,
  // Tickers only serve the current snapshot. Hourly pulls would store that
  // same number 24 times, so this adapter runs once, at the current time.
  pullHourly: false,
  fetch,
  chains: [CHAIN.MORPH_TACHYON],
  runAtCurrTime: true,
  methodology: {
    OpenInterest: 'Current one-sided USD notional of open futures positions: each contract\'s open interest in base units times its mark price. The endpoint has no time range, so historical open interest is not available. Long and short are not reported separately.',
  },
}

export default adapter
