import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchDittoLifiVolume } from '../../helpers/aggregators/ditto-lifi'
import { CHAIN } from '../../helpers/chains'

/** Return completed cross-chain routed volume for the requested source-chain window. */
const fetch = async (options: FetchOptions) => ({
  dailyBridgeVolume: await fetchDittoLifiVolume(options, 'cross-chain'),
})

const adapter: SimpleAdapter = {
  version: 2,
  // LI.FI supports arbitrary timestamp windows; local filtering is half-open.
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: '2026-09-26' },
    [CHAIN.BASE]: { fetch, start: '2026-10-03' },
  },
  doublecounted: true,
  methodology: {
    Volume: "Source-side USD value of completed cross-chain LI.FI routes carrying either verified Ditto integrator ID, counted once on the source chain.",
  },
}

export default adapter
