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

// same comptrollers as fees/kinetic: the core pool and the two isolated pools.
// deployedAt is the creation block on the Flare explorer; a comptroller is skipped for windows before it existed.
const comptrollers = [
  { address: '0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8', deployedAt: 26963787 }, // 2024-07-16
  { address: '0xDcce91d46Ecb209645A26B5885500127819BeAdd', deployedAt: 38815516 }, // 2025-03-16
  { address: '0x15F69897E6aEBE0463401345543C26d1Fd994abB', deployedAt: 48017074 }, // 2025-09-23
]

// the two native FLR markets (core kFLR and isolated isoFLR) have no underlying(); their cash equals their FLR balance
const NATIVE_MARKETS = new Set([
  '0xb84f771305d10607dd086b2f89712c0ced379407',
  '0xd7291d5001693d15b6e4d56d73b5d2cd7ecfe5c6',
])

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const toBlock = await options.getToBlock()
  const active = comptrollers.filter(c => c.deployedAt <= toBlock).map(c => c.address)
  const kTokens: string[] = (await options.api.multiCall({ abi: abis.getAllMarkets, calls: active })).flat()
  const underlyings = await options.api.multiCall({ abi: abis.underlying, calls: kTokens, permitFailure: true })
  const exchangeRates = await options.api.multiCall({ abi: abis.exchangeRateStored, calls: kTokens })

  const markets: Record<string, { underlying: string; exchangeRate: bigint }> = {}
  kTokens.forEach((kToken, i) => {
    let underlying = underlyings[i]
    if (!underlying) {
      if (!NATIVE_MARKETS.has(kToken.toLowerCase())) throw new Error(`kinetic: underlying() failed for ${kToken}`)
      underlying = ADDRESSES.null
    }
    markets[kToken.toLowerCase()] = { underlying, exchangeRate: BigInt(exchangeRates[i]) }
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
