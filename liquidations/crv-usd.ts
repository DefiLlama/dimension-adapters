import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { config } from '../fees/crv-usd'
import { fetchLlammaLiquidations } from '../helpers/curve/liquidations'

const fetch = async (options: FetchOptions) => {
  const { factory } = config[options.chain]
  const n = await options.api.call({ target: factory, abi: 'uint256:n_collaterals' })
  const indexes = Array.from({ length: Number(n) }, (_, i) => i)
  const [controllers, collaterals] = await Promise.all([
    options.api.multiCall({ target: factory, abi: 'function controllers(uint256) view returns (address)', calls: indexes }),
    options.api.multiCall({ target: factory, abi: 'function collaterals(uint256) view returns (address)', calls: indexes }),
  ])
  const markets = controllers.map((controller: string, i: number) => ({ controller, collateral: collaterals[i], borrowed: ADDRESSES.ethereum.CRVUSD }))
  return fetchLlammaLiquidations(options, markets)
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-05-14',
  methodology: {
    CollateralLiquidated: 'Collateral and crvUSD taken from the borrower\'s LLAMMA position in Controller Liquidate events (hard liquidations). Self-liquidations, where the borrower closes their own loan, are excluded. Soft liquidation inside LLAMMA is not counted.',
  },
}

export default adapter
