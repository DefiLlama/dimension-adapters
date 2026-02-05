import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchBuilderCodeRevenue } from '../../helpers/hyperliquid'

const WALLET_V_BUILDER_ADDRESS = '0x68c68ba58f50bdbe5c4a6faf0186b140eab2b764'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: WALLET_V_BUILDER_ADDRESS });

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
  start: '2025-06-11',
  methodology,
  doublecounted: true,
}

export default adapter;
