import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { CARDBOARD_START, fetchCardboardFlows } from '../helpers/cardboard-trade'

const fetch = async (options: FetchOptions) => {
  const dailyLiquidationVolume = options.createBalances()
  const dailyCollateralLiquidated = options.createBalances()

  for (const market of await fetchCardboardFlows(options)) {
    dailyLiquidationVolume.add(ADDRESSES.solana.USDC, market.liquidated_size)
    dailyCollateralLiquidated.add(ADDRESSES.solana.USDC, market.liquidated_margin)
  }

  return {
    //dailyLiquidationVolume,
    dailyCollateralLiquidated,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: CARDBOARD_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    //LiquidationVolume: 'Notional (margin times leverage) of positions liquidated, including closes that executed at or past the bust price, which are settled as liquidations.',
    CollateralLiquidated: 'USDC margin forfeited by liquidated positions, including closes that executed at or past the bust price, which are settled as liquidations: a liquidation takes the whole isolated margin of the position.',
  },
}

export default adapter
