import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  FACTORY, FACTORY_DEPLOY_BLOCK, WETH,
  TAX_EVENT, getCollateralMap, getDailyTrades,
} from "../dexs/rhfun";

// RH.fun protocol fees on Robinhood Chain.
//
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

const ZERO = '0x0000000000000000000000000000000000000000'

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
  TaxToDividends: 'Token Tax to Holder Dividends',
  TaxBuybackBurn: 'Token Tax to Buyback and Burn',
  TaxToLockedLiquidity: 'Token Tax to Permanently Locked Liquidity',
  TaxToCreators: 'Token Tax to Market Recipients',
  GraduationToProtocol: 'Graduation Fees to Protocol',
} as const

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const collateralOf = await getCollateralMap(options)
  const taxMarkets = await options.getLogs({
    target: FACTORY,
    eventAbi: TAX_EVENT,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })
  // Tax accounting is quote-token denominated: WETH for native markets.
  const quoteOf: Record<string, string> = {}
  taxMarkets.forEach((l: any) => {
    quoteOf[String(l.token).toLowerCase()] = l.collateralToken === ZERO ? WETH : l.collateralToken
  })
  const processors = [...new Set(taxMarkets.map((l: any) => l.taxProcessor))]

  // 1. Curve trade fees. Native-market amounts are booked under WETH so the
  //    same-tx curve-tax subtraction below nets out within one token key.
  const { buys, sells } = await getDailyTrades(options)
  const bookTradeFee = (log: any) => {
    const collateral = collateralOf[String(log.token).toLowerCase()]
    if (collateral === undefined) return
    const key = collateral === ZERO ? WETH : collateral
    dailyFees.add(key, log.tradeFee, LABEL.CurveTradeFees)
    dailyProtocolRevenue.add(key, log.tradeFee, LABEL.TradeFeesToProtocol)
  }
  buys.forEach(bookTradeFee)
  sells.forEach(bookTradeFee)

  if (processors.length) {
    const [curveTaxLogs, dispatchLogs, burnLogs, lpLogs] = await Promise.all([
      options.getLogs({ targets: processors, eventAbi: BONDING_TAX_EVENT }),
      options.getLogs({ targets: processors, eventAbi: DISPATCH_EVENT }),
      options.getLogs({ targets: processors, eventAbi: BURN_EVENT }),
      options.getLogs({ targets: processors, eventAbi: LIQUIDITY_EVENT }),
    ])

    // Same-tx curve tax leaves the trade-fee bucket (counted at realization
    // instead), so the Curve Trade Fees label nets to the 1% protocol fee.
    curveTaxLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, -BigInt(log.quoteAmount), LABEL.CurveTradeFees)
      dailyProtocolRevenue.add(quote, -BigInt(log.quoteAmount), LABEL.TradeFeesToProtocol)
    })

    // 3. Tax realization.
    dispatchLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, BigInt(log.fee) + BigInt(log.market) + BigInt(log.dividend), LABEL.TokenTax)
      dailyProtocolRevenue.add(quote, log.fee, LABEL.TaxToProtocol)
      dailyHoldersRevenue.add(quote, log.dividend, LABEL.TaxToDividends)
      dailySupplySideRevenue.add(quote, log.market, LABEL.TaxToCreators)
    })
    burnLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      dailyFees.add(quote, log.quoteIn, LABEL.TokenTax)
      dailyHoldersRevenue.add(quote, log.quoteIn, LABEL.TaxBuybackBurn)
    })
    lpLogs.forEach((log: any) => {
      const quote = quoteOf[String(log.taxToken).toLowerCase()]
      if (quote === undefined) return
      // LP is minted to the dead address — value permanently committed to the
      // token, economically akin to a burn → holders revenue.
      dailyFees.add(quote, log.quoteAdded, LABEL.TokenTax)
      dailyHoldersRevenue.add(quote, log.quoteAdded, LABEL.TaxToLockedLiquidity)
    })
  }

  // 2. Graduation fees (migration fee + dust, in the paired token).
  const migrations = await options.getLogs({ target: FACTORY, eventAbi: MIGRATED_EVENT })
  migrations.forEach((log: any) => {
    const amount = BigInt(log.migrateFee) + BigInt(log.pairedDust)
    dailyFees.add(log.pairedToken, amount, LABEL.GraduationFees)
    dailyProtocolRevenue.add(log.pairedToken, amount, LABEL.GraduationToProtocol)
  })

  // Revenue = ProtocolRevenue + HoldersRevenue (official identity; also equals
  // Fees - SupplySideRevenue since every fee leg lands in exactly one bucket).
  const dailyRevenue = dailyProtocolRevenue.clone()
  dailyRevenue.addBalances(dailyHoldersRevenue)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'All fees generated by the protocol: the 1% trade fee on bonding-curve buys/sells, token taxes (curve phase and post-graduation DEX phase, counted when the TaxProcessor realizes them), and graduation fees (fixed migration fee + dust). Legs denominated in the launched tokens themselves are not counted.',
  UserFees: 'Same as Fees — all fees are paid by traders.',
  Revenue: 'Protocol revenue plus value routed to token holders (dividends, buyback-and-burn, permanently locked liquidity).',
  ProtocolRevenue: 'The 1% curve trade fee, graduation fees, and the protocol fee bucket of tax dispatches.',
  HoldersRevenue: 'Tax dispatched to token-holder dividends, quote spent on buyback-and-burn, and quote permanently locked as dead-address liquidity.',
  SupplySideRevenue: 'Tax dispatched to per-token market recipients (creator/community side).',
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
    [LABEL.TaxToDividends]: 'Tax dispatched to token-holder dividends.',
    [LABEL.TaxBuybackBurn]: 'Tax spent buying back and burning the token.',
    [LABEL.TaxToLockedLiquidity]: 'Tax paired into liquidity whose LP is minted to the dead address (permanently locked).',
  },
  ProtocolRevenue: {
    [LABEL.TradeFeesToProtocol]: 'The 1% curve trade fee, kept by the protocol.',
    [LABEL.TaxToProtocol]: 'The protocol fee bucket of tax dispatches.',
    [LABEL.GraduationToProtocol]: 'Graduation fees kept by the protocol.',
  },
  HoldersRevenue: {
    [LABEL.TaxToDividends]: 'Tax dispatched to token-holder dividends.',
    [LABEL.TaxBuybackBurn]: 'Tax spent buying back and burning the token.',
    [LABEL.TaxToLockedLiquidity]: 'Tax paired into liquidity whose LP is minted to the dead address (permanently locked).',
  },
  SupplySideRevenue: {
    [LABEL.TaxToCreators]: 'Tax dispatched to per-token market recipients (creator/community side).',
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
