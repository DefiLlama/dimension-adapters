import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

// Moonwell Lending is a Compound V2 fork; mTokens emit the standard non-indexed LiquidateBorrow
const LiquidateBorrowEvent = 'event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address mTokenCollateral, uint256 seizeTokens)'

const abis = {
  getAllMarkets: 'address[]:getAllMarkets',
  underlying: 'address:underlying',
  exchangeRateStored: 'uint256:exchangeRateStored',
}

// same comptrollers as fees/moonwell; Moonbeam is left out, it is tracked under moonwell-artemis
const chainConfig: Record<string, { comptroller: string; start: string }> = {
  [CHAIN.BASE]: { comptroller: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C', start: '2023-08-04' },
  [CHAIN.OPTIMISM]: { comptroller: '0xCa889f40aae37FFf165BccF69aeF1E82b5C511B9', start: '2024-07-11' },
  [CHAIN.ETHEREUM]: { comptroller: '0xdec80bB934397575594E91970b37baf65f5b21bE', start: '2026-05-27' },
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const mTokens: string[] = await options.api.call({ target: chainConfig[options.chain].comptroller, abi: abis.getAllMarkets })
  // the native ETH market has no underlying() and falls back to the gas token
  const underlyings = await options.api.multiCall({ abi: abis.underlying, calls: mTokens, permitFailure: true })
  const exchangeRates = await options.api.multiCall({ abi: abis.exchangeRateStored, calls: mTokens })

  const markets: Record<string, { underlying: string; exchangeRate: bigint }> = {}
  mTokens.forEach((mToken, i) => {
    markets[mToken.toLowerCase()] = { underlying: underlyings[i] ?? ADDRESSES.null, exchangeRate: BigInt(exchangeRates[i]) }
  })

  const events: any[] = await options.getLogs({ targets: mTokens, eventAbi: LiquidateBorrowEvent })
  for (const event of events) {
    const market = markets[event.mTokenCollateral.toLowerCase()]
    if (!market) continue
    // seizeTokens is in mToken units; exchangeRateStored is scaled by 1e18
    dailyCollateralLiquidated.add(market.underlying, (BigInt(event.seizeTokens) * market.exchangeRate) / BigInt(1e18))
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }])),
  fetch,
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Moonwell LiquidateBorrow events, converted from mToken units to underlying via exchangeRateStored.',
  },
}

export default adapter
