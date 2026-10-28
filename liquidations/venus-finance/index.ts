import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { configs } from '../../fees/venus-finance'

const LiquidateBorrowEvent = 'event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address vTokenCollateral, uint256 seizeTokens)'
const LiquidateBorrowIndexedEvent = 'event LiquidateBorrow(address indexed liquidator, address indexed borrower, uint256 repayAmount, address indexed vTokenCollateral, uint256 seizeTokens)'

const abis = {
  getAllMarkets: 'address[]:getAllMarkets',
  underlying: 'address:underlying',
  exchangeRateStored: 'uint256:exchangeRateStored',
}

const chainConfig: Record<string, { start: string; eventAbi: string }> = {
  [CHAIN.BSC]: { start: '2020-11-23', eventAbi: LiquidateBorrowEvent },
  [CHAIN.ETHEREUM]: { start: '2024-01-10', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.OP_BNB]: { start: '2024-02-16', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.ARBITRUM]: { start: '2024-05-30', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.ERA]: { start: '2024-09-06', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.OPTIMISM]: { start: '2024-10-01', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.BASE]: { start: '2024-12-07', eventAbi: LiquidateBorrowIndexedEvent },
  [CHAIN.UNICHAIN]: { start: '2025-02-08', eventAbi: LiquidateBorrowIndexedEvent },
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()
  const { eventAbi } = chainConfig[options.chain]

  const vTokens: string[] = await options.api.call({ target: configs[options.chain].comptroller, abi: abis.getAllMarkets })
  // vBNB has no underlying() and falls back to the native token
  const underlyings = await options.api.multiCall({ abi: abis.underlying, calls: vTokens, permitFailure: true })
  const exchangeRates = await options.api.multiCall({ abi: abis.exchangeRateStored, calls: vTokens })

  const markets: Record<string, { underlying: string; exchangeRate: bigint }> = {}
  vTokens.forEach((vToken, i) => {
    markets[vToken.toLowerCase()] = { underlying: underlyings[i] ?? ADDRESSES.null, exchangeRate: BigInt(exchangeRates[i]) }
  })

  const events: any[] = await options.getLogs({ targets: vTokens, eventAbi })
  for (const event of events) {
    const market = markets[event.vTokenCollateral.toLowerCase()]
    if (!market) continue
    // seizeTokens is in vToken units; exchangeRateStored is scaled by 1e18
    dailyCollateralLiquidated.add(market.underlying, (BigInt(event.seizeTokens) * market.exchangeRate) / BigInt(1e18))
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Venus core pool LiquidateBorrow events, converted from vToken units to underlying via exchangeRateStored.',
  },
}

export default adapter
