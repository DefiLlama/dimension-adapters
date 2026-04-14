import { Fetch, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { fetchNeonyStats } from '../../helpers/neony'

const fetch: Fetch = async (_timestamp, _chainBlocks, options: FetchOptions) => {
  const stats = await fetchNeonyStats(options)
  const dailyVolume = options.createBalances()
  dailyVolume.addCGToken('usd-coin', stats.spotDailyVolumeUsd)

  return {
    dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEONY],
  start: '2026-03-05',
  methodology: {
    Volume: 'Spot daily trading volume in USD.'
  }
}

export default adapter
