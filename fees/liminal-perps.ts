import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const BUILDER_CODE_ADDRESS = '0x7e1830b1796b01f2f6a7118d50d4d02491421f32'

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
  start: '2025-07-20',
  methodology,
  doublecounted: true,
}

export default adapter;
