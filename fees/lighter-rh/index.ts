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

  dailyRevenue.addUSDValue(tradingFees, METRIC.TRADING_FEES)
  dailyRevenue.addUSDValue(transferFee, 'Transfer Fees')
  dailyRevenue.addUSDValue(withdrawFee, METRIC.DEPOSIT_WITHDRAW_FEES)
  dailyFees.addUSDValue(liquidationFee, METRIC.LIQUIDATION_FEES)
  dailyFees.addBalances(dailyRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const methodology = {
  Fees: 'Maker, taker and liquidation fees paid by traders on the Lighter Robinhood perpetuals deployment.',
  Revenue: 'Protocol revenue from maker and taker fees, plus transfer and withdraw fees. Liquidation fees are excluded as they go directly to LLP.',
  ProtocolRevenue: 'All trading and operational fees collected by the protocol treasury.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from perpetual trading.',
    'Transfer Fees': 'Transfer fees paid by traders on Lighter.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees paid by traders on Lighter.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid by traders on Lighter.',
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
