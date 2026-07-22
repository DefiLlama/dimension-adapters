import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// RH.fun — bonding-curve token launchpad on Robinhood Chain.
// Volume = trades executed on the bonding curves themselves (gross collateral,
// fees included). Post-graduation swaps execute on the chain's Uniswap V2 DEX
// (a different venue) and are not counted here.
export const FACTORY = '0x32a00Df7C511A882f3A7a18bcD69367880239726'
export const FACTORY_DEPLOY_BLOCK = 12923899
export const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'

export const CURVE_EVENT = 'event NewRHTokenCurveParams(address indexed addr, address indexed bondingCurve, uint256 initialTokenSupply, uint256 virtualCollateralReservesInitial, uint256 virtualTokenReservesInitial, uint256 feeBPS, uint256 mcLowerLimit, uint256 mcUpperLimit, uint256 tokensMigrationThreshold, uint256 fixedMigrationFee, uint256 firstBuyFee, uint256 targetCollectionAmount, address collateralToken)'
export const TAX_EVENT = 'event NewRHTaxTokenParams(address indexed token, address indexed bondingCurve, address indexed collateralToken, address mainPool, address taxProcessor, address dividendContract, uint16 taxRateBps, uint64 taxDuration, uint64 antiFarmerDuration, uint256 minBuyBackQuote, uint16 processorFeeRateCurve, uint16 processorFeeRateDex, uint16 processorMarketBps, uint16 processorDeflationBps, uint16 processorLpBps, uint16 processorDividendBps, uint256 minimumShareBalance, address marketAddress)'
const BUY_EVENT = 'event Buy(address indexed buyer, address indexed token, uint256 tokenAmount, uint256 collateralAmount, uint256 refund, uint256 tradeFee, uint256 curveProgressBps, uint256 virtualCollateralReserves, uint256 virtualTokenReserves, uint256 collateralReserves, uint256 tokenReserves)'
const SELL_EVENT = 'event Sell(address indexed seller, address indexed token, uint256 tokenAmount, uint256 collateralAmount, uint256 tradeFee, uint256 curveProgressBps, uint256 virtualCollateralReserves, uint256 virtualTokenReserves, uint256 collateralReserves, uint256 tokenReserves)'

// token → collateralToken (0x0 = native ETH), from the full creation history.
export async function getCollateralMap(options: FetchOptions): Promise<Record<string, string>> {
  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: CURVE_EVENT,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })
  const map: Record<string, string> = {}
  launches.forEach((l: any) => { map[String(l.addr).toLowerCase()] = l.collateralToken })
  return map
}

export async function getDailyTrades(options: FetchOptions) {
  const [buys, sells] = await Promise.all([
    options.getLogs({ target: FACTORY, eventAbi: BUY_EVENT }),
    options.getLogs({ target: FACTORY, eventAbi: SELL_EVENT }),
  ])
  return { buys, sells }
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const collateralOf = await getCollateralMap(options)
  const { buys, sells } = await getDailyTrades(options)

  // Buy.collateralAmount is gross (fees included); Sell.collateralAmount is net
  // of fees, so the fee is added back for a symmetric gross-notional volume.
  buys.forEach((log: any) => {
    const collateral = collateralOf[String(log.token).toLowerCase()]
    if (collateral === undefined) return
    dailyVolume.add(collateral, log.collateralAmount, 'Bonding Curve Trades')
  })
  sells.forEach((log: any) => {
    const collateral = collateralOf[String(log.token).toLowerCase()]
    if (collateral === undefined) return
    dailyVolume.add(collateral, BigInt(log.collateralAmount) + BigInt(log.tradeFee), 'Bonding Curve Trades')
  })

  return { dailyVolume }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-18',
  pullHourly: true,
  methodology: {
    Volume: 'Gross collateral notional (ETH and USDG, fees included) of buys and sells executed on RH.fun bonding curves, from the factory Buy/Sell events. Post-graduation swaps happen on the chain\'s Uniswap V2 DEX and are not counted here.',
  },
  breakdownMethodology: {
    Volume: {
      'Bonding Curve Trades': 'Gross collateral notional (fees included) of buys and sells on RH.fun bonding curves.',
    },
  },
}

export default adapter
