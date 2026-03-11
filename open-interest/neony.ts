import { Fetch, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { fetchNeonyStats } from '../helpers/neony'

const fetch: Fetch = async (_timestamp, _chainBlocks, options: FetchOptions) => {
  const stats = await fetchNeonyStats(options)
  const openInterestAtEnd = options.createBalances()
  openInterestAtEnd.addCGToken('usd-coin', stats.openInterestUsd)

  return {
    openInterestAtEnd
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEONY],
  start: '2026-03-05'
}

export default adapter
