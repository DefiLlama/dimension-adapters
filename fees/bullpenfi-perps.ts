import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const BUILDER_CODE_ADDRESS = '0x4c8731897503f86a2643959cbaa1e075e84babb7'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: BUILDER_CODE_ADDRESS });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'builder code revenue from Hyperliquid Perps Trades.',
  Revenue: 'builder code revenue from Hyperliquid Perps Trades.',
  ProtocolRevenue: 'builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-03-25',
  methodology,
  doublecounted: true,
}

export default adapter;
