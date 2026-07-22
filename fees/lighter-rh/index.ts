import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL, { fetchURLAutoHandleRateLimit } from '../../utils/fetchURL'
import PromisePool from '@supercharge/promise-pool'

const API_BASE = 'https://api.rh.lighter.xyz/api/v1'

interface ExchangeMetricResponse {
  code: number
  metrics: Array<{ timestamp: number; data: number }>
}

interface OrderBookDetail {
  symbol: string
  market_id: number
  market_type: string
  status: string
}

/** Perp markets only. Lighter's Robinhood spot markets (e.g. NVDA/USDG) are a
 * separate protocol tracked by dexs/lighter-spot, and the unfiltered
 * exchangeMetrics value is the perp+spot total — so we scope fees to the active
 * perp markets, exactly like mainnet Lighter (fees/lighterv2). */
async function getActivePerpMarkets(): Promise<OrderBookDetail[]> {
  const res: { order_book_details?: OrderBookDetail[] } = await fetchURL(`${API_BASE}/orderBookDetails`)
  return (res?.order_book_details || []).filter(
    (m) => m.market_type === 'perp' && m.status === 'active'
  )
}

async function fetchMetricByMarket(kind: string, symbol: string, startOfDay: number): Promise<number> {
  const res: ExchangeMetricResponse = await fetchURLAutoHandleRateLimit(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}&filter=byMarket&value=${encodeURIComponent(symbol)}`
  )
  const metric = (res?.metrics || []).find((m) => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function fetchMetricGlobal(kind: string, startOfDay: number): Promise<number> {
  const res: ExchangeMetricResponse = await fetchURL(`${API_BASE}/exchangeMetrics?period=all&kind=${kind}`)
  const metric = (res?.metrics || []).find((m) => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const markets = await getActivePerpMarkets()
  options.api.log('Lighter Robinhood active perp markets #', markets.length)

  let makerFee = 0
  let takerFee = 0
  let liquidationFee = 0

  await PromisePool.withConcurrency(3)
    .for(markets)
    .process(async (market) => {
      const [mk, tk, lq] = await Promise.all([
        fetchMetricByMarket('maker_fee', market.symbol, options.startOfDay),
        fetchMetricByMarket('taker_fee', market.symbol, options.startOfDay),
        fetchMetricByMarket('liquidation_fee', market.symbol, options.startOfDay),
      ])
      makerFee += mk
      takerFee += tk
      liquidationFee += lq
    })

  // Transfer / withdraw fees are account-level (not per-market); read globally.
  const [transferFee, withdrawFee] = await Promise.all([
    fetchMetricGlobal('transfer_fee', options.startOfDay),
    fetchMetricGlobal('withdraw_fee', options.startOfDay),
  ])

  const tradingFees = makerFee + takerFee

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Protocol revenue: maker, taker, transfer and withdraw fees.
  dailyRevenue.addUSDValue(tradingFees, METRIC.TRADING_FEES)
  dailyRevenue.addUSDValue(transferFee, 'Transfer Fees')
  dailyRevenue.addUSDValue(withdrawFee, METRIC.DEPOSIT_WITHDRAW_FEES)

  // Liquidation fees are routed to the Lighter Liquidity Pool (LLP) — i.e. the
  // supply side (liquidity providers), not the protocol. Booking them as
  // supply-side revenue keeps dailyFees = dailyRevenue + dailySupplySideRevenue.
  dailySupplySideRevenue.addUSDValue(liquidationFee, METRIC.LIQUIDATION_FEES)

  dailyFees.addBalances(dailyRevenue)
  dailyFees.addBalances(dailySupplySideRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'All fees paid by traders on the Lighter Robinhood perpetuals deployment: maker, taker, transfer, withdraw and liquidation fees. Scoped to perp markets (spot is tracked separately as lighter-spot).',
  Revenue: 'Protocol revenue from maker, taker, transfer and withdraw fees. Liquidation fees are excluded — they go to the LLP (see SupplySideRevenue).',
  ProtocolRevenue: 'Same as Revenue: maker, taker, transfer and withdraw fees retained by the protocol.',
  SupplySideRevenue: 'Liquidation fees, which are paid to the Lighter Liquidity Pool (LLP) — i.e. to liquidity providers, not the protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from perpetual trading (summed across active perp markets).',
    'Transfer Fees': 'Transfer fees paid by traders on Lighter.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees paid by traders on Lighter.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid by traders, routed to the LLP.',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees retained by the protocol.',
    'Transfer Fees': 'Transfer fees retained by the protocol.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees retained by the protocol.',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees retained by the protocol.',
    'Transfer Fees': 'Transfer fees retained by the protocol.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees retained by the protocol.',
  },
  SupplySideRevenue: {
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid to the Lighter Liquidity Pool (LLP).',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-06-26',
  methodology,
  breakdownMethodology,
}

export default adapter
