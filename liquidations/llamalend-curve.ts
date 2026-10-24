import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { OneWayLendingFactories } from '../fees/llamalend-curve'
import { fetchLlammaLiquidations, getLlamaLendMarkets } from '../helpers/curve/liquidations'

const fetch = async (options: FetchOptions) => {
  const markets = await getLlamaLendMarkets(options, OneWayLendingFactories[options.chain])
  return fetchLlammaLiquidations(options, markets)
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(Object.entries(OneWayLendingFactories).map(([chain, { start }]) => [chain, { fetch, start }])),
  methodology: {
    CollateralLiquidated: 'Collateral and borrowed token taken from the borrower\'s LLAMMA position in Controller Liquidate events (hard liquidations). Self-liquidations, where the borrower closes their own loan, are excluded. Soft liquidation inside LLAMMA is not counted.',
  },
}

export default adapter
