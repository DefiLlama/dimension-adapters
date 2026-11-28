import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { EVENTS, VAULT, usd30 } from '../helpers/zeustrade'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  // Only Vault position events are counted, so a trade routed through the
  // PositionRouter, PositionManager or OrderBook is counted once. Collateral
  // swaps, ZLP mints and redeems, pending orders and LiquidatePosition are not volume.
  const increases = await options.getLogs({ target: VAULT, eventAbi: EVENTS.increasePosition })
  const decreases = await options.getLogs({ target: VAULT, eventAbi: EVENTS.decreasePosition })

  for (const log of [...increases, ...decreases]) {
    dailyVolume.addUSDValue(usd30(log.sizeDelta))
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-05-05',
  methodology: {
    Volume: 'Notional size of every executed position open, increase, decrease and close on crypto and US stock markets (NVDA, TSLA, AAPL, GOOGL, MSTR), from the Vault IncreasePosition and DecreasePosition events. A position the Vault closes for exceeding the maximum leverage while collateral is left is a DecreasePosition and counts; LiquidatePosition does not.',
  },
}

export default adapter
