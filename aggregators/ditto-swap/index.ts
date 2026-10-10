import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchDittoLifiVolume } from '../../helpers/aggregators/ditto-lifi'
import { CHAIN } from '../../helpers/chains'

const fetch = async (options: FetchOptions) => ({
  dailyVolume: await fetchDittoLifiVolume(options, 'same-chain'),
})

const adapter: SimpleAdapter = {
  version: 2,
  // Venue API attribution across routers; avoid 24 hourly windows per integrator/chain.
  // Each query and local filter still enforce the exact requested half-open window.
  pullHourly: false,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: '2026-08-28' },
    [CHAIN.BASE]: { fetch, start: '2026-10-03' },
  },
  doublecounted: true,
  methodology: {
    Volume: "Source-side USD value of completed same-chain LI.FI routes carrying either verified Ditto integrator ID, counted once on the source chain.",
  },
}

export default adapter
