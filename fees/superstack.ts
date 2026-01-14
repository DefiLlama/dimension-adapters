import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const APP_BUILDER_ADD = '0xCDb943570BcB48a6F1d3228d0175598fEA19E87B'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: APP_BUILDER_ADD });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'Builder code revenue from Hyperliquid Perps Trades.',
  Revenue: 'Builder code revenue from Hyperliquid Perps Trades.',
  ProtocolRevenue: 'Builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-10-28',
  methodology,
  doublecounted: true,
}

export default adapter;

