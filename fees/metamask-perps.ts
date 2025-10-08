import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const METAMASk_APP_BUILDER_ADD = '0xe95a5e31904e005066614247d309e00d8ad753aa'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: METAMASk_APP_BUILDER_ADD });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'BBuilder code revenue from Hyperliquid Perps Trades.',
  Revenue: 'Builder code revenue from Hyperliquid Perps Trades.',
  ProtocolRevenue: 'Builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-10-07',
  methodology,
  doublecounted: true,
}

export default adapter;

