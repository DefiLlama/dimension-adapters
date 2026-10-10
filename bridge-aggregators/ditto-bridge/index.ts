import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchDittoLifiVolume } from '../../helpers/aggregators/ditto-lifi'
import { CHAIN } from '../../helpers/chains'

const fetch = async (options: FetchOptions) => ({
  dailyBridgeVolume: await fetchDittoLifiVolume(options, 'cross-chain'),
})

const adapter: SimpleAdapter = {
  version: 2,
  // Venue API attribution across routers; avoid 24 hourly windows per integrator/chain.
  // Each query and local filter still enforce the exact requested half-open window.
  pullHourly: false,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: '2026-09-26' },
    [CHAIN.BASE]: { fetch, start: '2026-10-03' },
  },
  doublecounted: true,
  methodology: {
    BridgeVolume: "Source-side USD value of completed cross-chain LI.FI routes carrying either verified Ditto integrator ID, counted once on the source chain.",
  },
}

export default adapter
