import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'

const API_BASE = 'https://api.rh.lighter.xyz/api/v1'

interface ExchangeMetricResponse {
  code: number
  metrics: Array<{ timestamp: number; data: number }>
}

/** Lighter's Robinhood perpetuals deployment exposes the same exchangeMetrics
 * API as mainnet Lighter (see fees/lighterv2). Each `kind` returns a daily USD
 * series keyed by UTC-midnight timestamp. The unfiltered (exchange-wide) value
 * equals the sum across every market — verified against the per-market
 * `filter=byMarket` breakdown — so we read the global metric directly instead
 * of iterating all markets, keeping the adapter light. */
async function fetchMetric(kind: string, startOfDay: number): Promise<number> {
  const response: ExchangeMetricResponse = await fetchURL(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}`
  )
  if (!response?.metrics || !Array.isArray(response.metrics)) return 0
  const metric = response.metrics.find(m => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const [makerFee, takerFee, liquidationFee, transferFee, withdrawFee] = await Promise.all([
    fetchMetric('maker_fee', options.startOfDay),
    fetchMetric('taker_fee', options.startOfDay),
    fetchMetric('liquidation_fee', options.startOfDay),
    fetchMetric('transfer_fee', options.startOfDay),
    fetchMetric('withdraw_fee', options.startOfDay),
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
  Fees: 'All fees paid by traders on the Lighter Robinhood perpetuals deployment: maker, taker, transfer, withdraw and liquidation fees.',
  Revenue: 'Protocol revenue from maker, taker, transfer and withdraw fees. Liquidation fees are excluded — they go to the LLP (see SupplySideRevenue).',
  ProtocolRevenue: 'Same as Revenue: maker, taker, transfer and withdraw fees retained by the protocol.',
  SupplySideRevenue: 'Liquidation fees, which are paid to the Lighter Liquidity Pool (LLP) — i.e. to liquidity providers, not the protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from perpetual trading.',
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
