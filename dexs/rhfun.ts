import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// RH.fun — bonding-curve token launchpad on Robinhood Chain.
// Volume = trades executed on the bonding curves themselves (gross collateral,
// fees included). Post-graduation swaps execute on the chain's Uniswap V2 DEX
// (a different venue) and are not counted here.
// RHFactory proxy: single entry point that emits all market events
// (NewRHTokenCurveParams / NewRHTaxTokenParams on creation, Buy/Sell on trades,
// V2Migrated on graduation). Deployed via delegatecall modules, so all events
// surface under this address.
const FACTORY = '0x32a00Df7C511A882f3A7a18bcD69367880239726'
const FACTORY_DEPLOY_BLOCK = 12923899
// Canonical WETH on Robinhood Chain (chain id 4663). Native-ETH markets use the
// zero address as their collateral/quote token; we normalize it to WETH so a
// market's volume/fees land under one key instead of splitting native vs WETH.
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
const ZERO = '0x0000000000000000000000000000000000000000'
const quoteToken = (collateral: string) => (collateral === ZERO ? WETH : collateral)

const CURVE_EVENT = 'event NewRHTokenCurveParams(address indexed addr, address indexed bondingCurve, uint256 initialTokenSupply, uint256 virtualCollateralReservesInitial, uint256 virtualTokenReservesInitial, uint256 feeBPS, uint256 mcLowerLimit, uint256 mcUpperLimit, uint256 tokensMigrationThreshold, uint256 fixedMigrationFee, uint256 firstBuyFee, uint256 targetCollectionAmount, address collateralToken)'
const TAX_EVENT = 'event NewRHTaxTokenParams(address indexed token, address indexed bondingCurve, address indexed collateralToken, address mainPool, address taxProcessor, address dividendContract, uint16 taxRateBps, uint64 taxDuration, uint64 antiFarmerDuration, uint256 minBuyBackQuote, uint16 processorFeeRateCurve, uint16 processorFeeRateDex, uint16 processorMarketBps, uint16 processorDeflationBps, uint16 processorLpBps, uint16 processorDividendBps, uint256 minimumShareBalance, address marketAddress)'
const BUY_EVENT = 'event Buy(address indexed buyer, address indexed token, uint256 tokenAmount, uint256 collateralAmount, uint256 refund, uint256 tradeFee, uint256 curveProgressBps, uint256 virtualCollateralReserves, uint256 virtualTokenReserves, uint256 collateralReserves, uint256 tokenReserves)'
const SELL_EVENT = 'event Sell(address indexed seller, address indexed token, uint256 tokenAmount, uint256 collateralAmount, uint256 tradeFee, uint256 curveProgressBps, uint256 virtualCollateralReserves, uint256 virtualTokenReserves, uint256 collateralReserves, uint256 tokenReserves)'

// Fee streams (all factory / per-token-clone events):
// 1. Curve trades: 1% protocol fee on every bonding-curve buy/sell. The Buy/Sell
//    `tradeFee` field also includes the tax-token tax, which is forwarded to the
//    TaxProcessor in the same tx and emitted as TaxProcessorBondingCurveTax — we
//    subtract it here and count all tax at realization (step 3) instead, so
//    nothing is double counted.
// 2. Graduation: fixed migration fee + rounding dust, paid to the protocol in
//    the paired token (V2Migrated).
// 3. Tax realization: accrued tax (curve-phase + post-graduation DEX-phase) is
//    dispatched by the TaxProcessor into fee / market / dividend buckets, spent
//    on buyback-and-burn, or paired into permanently locked liquidity (LP minted
//    to the dead address) — all quote-token denominated events on the per-token
//    TaxProcessor clones. Legs denominated in the launched tokens themselves
//    (direct token burns, the token side of locked LP) are not priced and not
//    counted — a conservative undercount.
const BONDING_TAX_EVENT = 'event TaxProcessorBondingCurveTax(address indexed taxToken, uint256 quoteAmount)'
const DISPATCH_EVENT = 'event TaxProcessorDispatchExecuted(address indexed taxToken, uint256 fee, uint256 market, uint256 dividend)'
const BURN_EVENT = 'event TaxProcessorBurnExecuted(address indexed taxToken, uint256 quoteIn, uint256 tokensBurned)'
const LIQUIDITY_EVENT = 'event TaxProcessorLiquidityAdded(address indexed taxToken, uint256 tokenAdded, uint256 quoteAdded, uint256 liquidityMinted)'
const MIGRATED_EVENT = 'event V2Migrated(address indexed token, address indexed pairedToken, address indexed pair, uint256 tokenIn, uint256 pairedIn, uint256 liquidity, uint256 tokenDust, uint256 pairedDust, uint256 migrateFee)'

// Source-of-fees labels (dailyFees) and destination labels (revenue buckets),
// per the repo breakdown-label guidelines.
const LABEL = {
  // sources
  CurveTradeFees: 'Curve Trade Fees',
  TokenTax: 'Token Tax',
  GraduationFees: 'Graduation Fees',
  // destinations
  TradeFeesToProtocol: 'Curve Trade Fees to Protocol',
  TaxToProtocol: 'Token Tax to Protocol',
  TaxToDividends: 'Token Tax to Token-Holder Dividends',
  TaxBuybackBurn: 'Token Tax to Buyback and Burn',
  TaxToLockedLiquidity: 'Token Tax to Permanently Locked Liquidity',
  TaxToCreators: 'Token Tax to Market Recipients',
  GraduationToProtocol: 'Graduation Fees to Protocol',
}


async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const launchLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: CURVE_EVENT,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })

  const collateralOf: Record<string, string> = {}
  launchLogs.forEach((l: any) => { collateralOf[String(l.addr).toLowerCase()] = l.collateralToken })

  const buys = await options.getLogs({ target: FACTORY, eventAbi: BUY_EVENT })
  const sells = await options.getLogs({ target: FACTORY, eventAbi: SELL_EVENT })

  // Buy.collateralAmount is gross (fees included); Sell.collateralAmount is net
  // of fees, so the fee is added back for a symmetric gross-notional volume.
  buys.forEach((log: any) => {
    const collateral = collateralOf[String(log.token).toLowerCase()]
    if (collateral === undefined) return
    const key = quoteToken(collateral)
    dailyVolume.add(key, log.collateralAmount)
    dailyFees.add(key, log.tradeFee, LABEL.CurveTradeFees)
    dailyProtocolRevenue.add(key, log.tradeFee, LABEL.TradeFeesToProtocol)
  })

  sells.forEach((log: any) => {
    const collateral = collateralOf[String(log.token).toLowerCase()]
    if (collateral === undefined) return
    const key = quoteToken(collateral)
    dailyVolume.add(key, BigInt(log.collateralAmount) + BigInt(log.tradeFee))
    dailyFees.add(key, log.tradeFee, LABEL.CurveTradeFees)
    dailyProtocolRevenue.add(key, log.tradeFee, LABEL.TradeFeesToProtocol)
  })

  const taxMarkets = await options.getLogs({
    target: FACTORY,
    eventAbi: TAX_EVENT,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })
  // Tax accounting is quote-token denominated: WETH for native markets.
  const quoteOf: Record<string, string> = {}
  taxMarkets.forEach((l: any) => {
    quoteOf[String(l.token).toLowerCase()] = quoteToken(l.collateralToken)
  })
  const processors = [...new Set(taxMarkets.map((l: any) => l.taxProcessor))]

  if (processors.length) {
    const procSet = new Set(processors.map((p: any) => String(p).toLowerCase()))
    const getProcessorLogs = (eventAbi: string) =>
      options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true })
        .then((logs: any[]) => logs
          .filter((log: any) => procSet.has(String(log.address).toLowerCase()))
          .map((log: any) => log.args))
    const curveTaxLogs = await getProcessorLogs(BONDING_TAX_EVENT)
    const dispatchLogs = await getProcessorLogs(DISPATCH_EVENT)
    const burnLogs = await getProcessorLogs(BURN_EVENT)
    const lpLogs = await getProcessorLogs(LIQUIDITY_EVENT)

    // Same-tx curve tax leaves the trade-fee bucket (counted at realization
    // instead), so the Curve Trade Fees label nets to the 1% protocol fee.
    curveTaxLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, -BigInt(log.quoteAmount), LABEL.CurveTradeFees)
      dailyProtocolRevenue.add(quote, -BigInt(log.quoteAmount), LABEL.TradeFeesToProtocol)
    })

    // 3. Tax realization. RH.fun has no protocol/governance token, so every tax
    //    destination other than the protocol fee bucket accrues to the launched
    //    token's own market/holders — i.e. supply-side revenue, not holders
    //    revenue (which is reserved for a protocol's own token holders).
    dispatchLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, BigInt(log.fee) + BigInt(log.market) + BigInt(log.dividend), LABEL.TokenTax)
      dailyProtocolRevenue.add(quote, log.fee, LABEL.TaxToProtocol)
      dailySupplySideRevenue.add(quote, log.dividend, LABEL.TaxToDividends)
      dailySupplySideRevenue.add(quote, log.market, LABEL.TaxToCreators)
    })
    burnLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, log.quoteIn, LABEL.TokenTax)
      dailySupplySideRevenue.add(quote, log.quoteIn, LABEL.TaxBuybackBurn)
    })
    lpLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      // LP is minted to the dead address — value permanently committed to the
      // launched token's liquidity, benefiting that token's holders (supply side).
      dailyFees.add(quote, log.quoteAdded, LABEL.TokenTax)
      dailySupplySideRevenue.add(quote, log.quoteAdded, LABEL.TaxToLockedLiquidity)
    })
  }

  // 2. Graduation fees (migration fee + dust, in the paired token).
  const migrations = await options.getLogs({ target: FACTORY, eventAbi: MIGRATED_EVENT })
  migrations.forEach((log: any) => {
    const amount = BigInt(log.migrateFee) + BigInt(log.pairedDust)
    dailyFees.add(log.pairedToken, amount, LABEL.GraduationFees)
    dailyProtocolRevenue.add(log.pairedToken, amount, LABEL.GraduationToProtocol)
  })

  // No protocol token → no holders revenue; Revenue = ProtocolRevenue, which also
  // equals Fees − SupplySideRevenue (every fee leg lands in exactly one bucket).
  // Clone so the two returned dimensions don't alias the same Balances instance.
  const dailyRevenue = dailyProtocolRevenue.clone()

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Gross collateral notional (ETH and USDG, fees included) of buys and sells executed on RH.fun bonding curves, from the factory Buy/Sell events. Post-graduation swaps happen on the chain\'s Uniswap V2 DEX and are not counted here.',
  Fees: 'All fees generated by the protocol: the 1% trade fee on bonding-curve buys/sells, token taxes (curve phase and post-graduation DEX phase, counted when the TaxProcessor realizes them), and graduation fees (fixed migration fee + dust). Legs denominated in the launched tokens themselves are not counted.',
  UserFees: 'Same as Fees — all fees are paid by traders.',
  Revenue: 'Protocol revenue: the 1% curve trade fee, graduation fees, and the protocol fee bucket of tax dispatches. RH.fun has no protocol token, so there is no holders revenue and Revenue equals ProtocolRevenue.',
  ProtocolRevenue: 'The 1% curve trade fee, graduation fees, and the protocol fee bucket of tax dispatches.',
  SupplySideRevenue: 'Token tax routed to the launched token\'s own side: market recipients (creator/community), token-holder dividends, buyback-and-burn, and permanently locked liquidity.',
}

const breakdownMethodology = {
  Fees: {
    [LABEL.CurveTradeFees]: 'The 1% protocol fee charged on every bonding-curve buy/sell (tax portion netted out and counted under Token Tax at realization).',
    [LABEL.TokenTax]: 'Token taxes realized by the per-token TaxProcessor: dispatches to fee/market/dividend buckets, buyback-and-burn spend, and quote paired into permanently locked liquidity.',
    [LABEL.GraduationFees]: 'Fixed migration fee plus rounding dust charged when a curve graduates to Uniswap V2.',
  },
  UserFees: {
    [LABEL.CurveTradeFees]: 'The 1% protocol fee charged on every bonding-curve buy/sell (tax portion netted out and counted under Token Tax at realization).',
    [LABEL.TokenTax]: 'Token taxes realized by the per-token TaxProcessor: dispatches to fee/market/dividend buckets, buyback-and-burn spend, and quote paired into permanently locked liquidity.',
    [LABEL.GraduationFees]: 'Fixed migration fee plus rounding dust charged when a curve graduates to Uniswap V2.',
  },
  Revenue: {
    [LABEL.TradeFeesToProtocol]: 'The 1% curve trade fee, kept by the protocol.',
    [LABEL.TaxToProtocol]: 'The protocol fee bucket of tax dispatches.',
    [LABEL.GraduationToProtocol]: 'Graduation fees kept by the protocol.',
  },
  ProtocolRevenue: {
    [LABEL.TradeFeesToProtocol]: 'The 1% curve trade fee, kept by the protocol.',
    [LABEL.TaxToProtocol]: 'The protocol fee bucket of tax dispatches.',
    [LABEL.GraduationToProtocol]: 'Graduation fees kept by the protocol.',
  },
  SupplySideRevenue: {
    [LABEL.TaxToCreators]: 'Tax dispatched to per-token market recipients (creator/community side).',
    [LABEL.TaxToDividends]: 'Tax dispatched to the launched token\'s holder dividends.',
    [LABEL.TaxBuybackBurn]: 'Tax spent buying back and burning the launched token.',
    [LABEL.TaxToLockedLiquidity]: 'Tax paired into the launched token\'s liquidity, with LP minted to the dead address (permanently locked).',
  },
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-18',
  pullHourly: true,
  methodology,
  breakdownMethodology,
}

export default adapter
