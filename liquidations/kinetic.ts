import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

// Kinetic is a Compound V2 fork on Flare; kTokens emit the standard non-indexed LiquidateBorrow
const LiquidateBorrowEvent = 'event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address cTokenCollateral, uint256 seizeTokens)'

const abis = {
  getAllMarkets: 'address[]:getAllMarkets',
  underlying: 'address:underlying',
  exchangeRateStored: 'uint256:exchangeRateStored',
}

// same comptrollers as fees/kinetic: the core pool and the two isolated pools
const comptrollers = [
  '0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8',
  '0xDcce91d46Ecb209645A26B5885500127819BeAdd',
  '0x15F69897E6aEBE0463401345543C26d1Fd994abB',
]

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const kTokens: string[] = (await options.api.multiCall({ abi: abis.getAllMarkets, calls: comptrollers })).flat()
  // kFLR has no underlying() and falls back to the gas token
  const underlyings = await options.api.multiCall({ abi: abis.underlying, calls: kTokens, permitFailure: true })
  const exchangeRates = await options.api.multiCall({ abi: abis.exchangeRateStored, calls: kTokens })

  const markets: Record<string, { underlying: string; exchangeRate: bigint }> = {}
  kTokens.forEach((kToken, i) => {
    markets[kToken.toLowerCase()] = { underlying: underlyings[i] ?? ADDRESSES.null, exchangeRate: BigInt(exchangeRates[i]) }
  })

  const events: any[] = await options.getLogs({ targets: kTokens, eventAbi: LiquidateBorrowEvent })
  for (const event of events) {
    const market = markets[event.cTokenCollateral.toLowerCase()]
    if (!market) continue
    // seizeTokens is in kToken units; exchangeRateStored is scaled by 1e18
    dailyCollateralLiquidated.add(market.underlying, (BigInt(event.seizeTokens) * market.exchangeRate) / BigInt(1e18))
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.FLARE],
  start: '2024-07-16',
  methodology: {
    CollateralLiquidated: 'USD value of collateral seized in LiquidateBorrow events across the Kinetic core pool and its isolated pools, converted from kToken units to the underlying with exchangeRateStored.',
  },
}

export default adapter
