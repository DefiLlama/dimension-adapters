import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryHyperliquidIndexer } from '../helpers/hyperliquid'

const fetch = async (options: FetchOptions) => {
  const results = await queryHyperliquidIndexer(options);

  return { dailyLiquidationVolume: results.dailyLiquidationVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-08-01',
  chains: [CHAIN.HYPERLIQUID],
  methodology: {
    LiquidationVolume: 'Total USD notional of liquidated positions, from the `amountQuote` field of ClearingHouse `Liquidation` events.',
  },
}

export default adapter
