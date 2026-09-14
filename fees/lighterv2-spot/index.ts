import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'
import PromisePool from '@supercharge/promise-pool'

// Lighter runs the same spot exchange on two deployments and dexs/lighter-spot already
// reports both; the fees side only ever read the zkLighter one. Robinhood's account-level
// transfer/withdraw fees are counted by fees/lighter-rh, so only the per-market trading
// fees are taken here.
const chainConfig: Record<string, { API: string; start: string; globalFees: boolean }> = {
  [CHAIN.ZK_LIGHTER]: { API: 'https://mainnet.zklighter.elliot.ai/api/v1', start: '2025-10-22', globalFees: true },
  [CHAIN.ROBINHOOD]: { API: 'https://api.rh.lighter.xyz/api/v1', start: '2026-06-26', globalFees: false },
}
const RATE_LIMIT_PER_MINUTE = 200

interface ExchangeMetricResponse {
  code: number
  metrics: Array<{
    timestamp: number
    data: number
  }>
}

interface OrderBookDetail {
  symbol: string
  market_id: number
  market_type: string
  status: string
}

interface OrderBookDetailsResponse {
  code: number
  spot_order_book_details: OrderBookDetail[]
}

async function fetchExchangeMetricByMarket(API_BASE: string, kind: string, symbol: string, startOfDay: number): Promise<number> {
  const response: ExchangeMetricResponse = await fetchURL(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}&filter=byMarket&value=${encodeURIComponent(symbol)}`
  )
  
  if (!response?.metrics || !Array.isArray(response.metrics)) {
    return 0
  }

  // Find the metric matching the startOfDay timestamp
  const metric = response.metrics.find(m => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function fetchExchangeMetricGlobal(API_BASE: string, kind: string, startOfDay: number): Promise<number> {
  const response: ExchangeMetricResponse = await fetchURL(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}`
  )
  
  if (!response?.metrics || !Array.isArray(response.metrics)) {
    return 0
  }

  // Find the metric matching the startOfDay timestamp
  const metric = response.metrics.find(m => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function getActiveSpotMarkets(API_BASE: string, api: any): Promise<OrderBookDetail[]> {
  const response: OrderBookDetailsResponse = await fetchURL(`${API_BASE}/orderBookDetails`)
  
  if (!response?.spot_order_book_details || !Array.isArray(response.spot_order_book_details)) {
    return []
  }

  // Filter for active spot markets only
  const activeSpotMarkets = response.spot_order_book_details.filter(
    market => market.market_type === 'spot' && market.status === 'active'
  )

  api.log('Active spot markets #', activeSpotMarkets.length)
  
  return activeSpotMarkets
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { API: API_BASE, globalFees } = chainConfig[options.chain]

  // Get all active spot markets
  const markets = await getActiveSpotMarkets(API_BASE, options.api)
  
  // Calculate concurrency based on rate limit
  // 2 fee types per market, 200 requests per minute limit
  const concurrency = 1
  const batchSize = concurrency
  const delayBetweenBatches = 60000 / (RATE_LIMIT_PER_MINUTE / 2) * batchSize // milliseconds
  
  let totalMakerFee = 0
  let totalTakerFee = 0
  let processedCount = 0

  await PromisePool.withConcurrency(concurrency)
    .for(markets)
    .process(async (market: OrderBookDetail) => {
      const [makerFee, takerFee] = await Promise.all([
        fetchExchangeMetricByMarket(API_BASE, 'maker_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket(API_BASE, 'taker_fee', market.symbol, options.startOfDay),
      ])

      totalMakerFee += makerFee
      totalTakerFee += takerFee
      
      processedCount++
      
      // Add delay after each batch to respect rate limits
      if (processedCount % batchSize === 0 && processedCount < markets.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
      }
    })

  // Fetch global fees once. They are exchange-wide rather than spot-only, so on Robinhood
  // they belong to fees/lighter-rh and taking them here as well would double count.
  const [totalTransferFee, totalWithdrawFee] = globalFees
    ? await Promise.all([
      fetchExchangeMetricGlobal(API_BASE, 'transfer_fee', options.startOfDay),
      fetchExchangeMetricGlobal(API_BASE, 'withdraw_fee', options.startOfDay),
    ])
    : [0, 0]

  const tradingFees = totalMakerFee + totalTakerFee

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(tradingFees, METRIC.TRADING_FEES)
  dailyFees.addUSDValue(totalTransferFee, 'Transfer Fees')
  dailyFees.addUSDValue(totalWithdrawFee, METRIC.DEPOSIT_WITHDRAW_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Maker and taker fees paid by traders on the Lighter DEX',
  Revenue: 'Protocol revenue from maker fees, taker fees, transfer fees, and withdraw fees.',
  ProtocolRevenue: 'All trading and operational fees collected by the protocol treasury',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from spot trading.',
    'Transfer Fees': 'Transfer fees paid by traders on the Lighter DEX',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees paid by traders on the Lighter DEX',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology,
  breakdownMethodology,
}

export default adapter
