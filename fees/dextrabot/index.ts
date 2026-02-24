import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchBuilderCodeRevenue } from '../../helpers/hyperliquid'

const DEXTRABOT_BUILDER_ADDRESS = '0x49ae63056b3a0be0b166813ee687309ab653c07c'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: DEXTRABOT_BUILDER_ADDRESS });

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
  start: '2025-02-16',
  methodology,
  doublecounted: true,
}

export default adapter;
