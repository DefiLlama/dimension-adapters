import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchBuilderCodeRevenue } from '../../helpers/hyperliquid'

const KINTO_BUILDER_ADDRESS = '0xc1f4d15c16a1f3555e0a5f7aefd1e17ad4aaf40b'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: KINTO_BUILDER_ADDRESS });

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
  start: '2024-12-24',
  methodology,
  doublecounted: true,
  // isExpensiveAdapter: true,
  deadFrom: '2025-09-07', // https://x.com/KintoXYZ/status/1964721235675537573
}

export default adapter;
