import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { fetchBuilderCodeRevenue } from '../../helpers/hyperliquid'
import { fetchPolymarketBuilderVolume } from "../../helpers/polymarket"

const hlBuilderCode = '0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36'

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions) => {
    return await fetchBuilderCodeRevenue({ options, builder_address: hlBuilderCode })
  }
const fetchPolymarket = async (_a: any, _b: any, options: FetchOptions) => {
    return await fetchPolymarketBuilderVolume({ options, builder: 'FlowBot' })
  }

const methodology = {
  Fees: 'Builder code revenue from Hyperliquid Perps Trades.',
  Revenue: 'Builder code revenue from Hyperliquid Perps Trades.',
  ProtocolRevenue: 'Builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: '2025-11-27'
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolymarket,
      start: '2025-12-31'
    }
  },
  methodology,
  doublecounted: true,
}

export default adapter;