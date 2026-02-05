import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'
import PromisePool from '@supercharge/promise-pool'

const API_BASE = 'https://mainnet.zklighter.elliot.ai/api/v1'
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

async function fetchExchangeMetricByMarket(kind: string, symbol: string, startOfDay: number): Promise<number> {
  const response: ExchangeMetricResponse = await fetchURL(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}&filter=byMarket&value=${symbol}`
  )
  
  if (!response?.metrics || !Array.isArray(response.metrics)) {
    return 0
  }

  // Find the metric matching the startOfDay timestamp
  const metric = response.metrics.find(m => m.timestamp === startOfDay)
  return metric?.data || 0
}

async function getActiveSpotMarkets(api: any): Promise<OrderBookDetail[]> {
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

async function fetch(_: any, _1: any, options: FetchOptions): Promise<FetchResultV2> {
  // Get all active spot markets
  const markets = await getActiveSpotMarkets(options.api)
  
  // Calculate concurrency based on rate limit
  // 5 fee types per market, 200 requests per minute limit
  // Use concurrency of 30 to be safe (30 * 5 = 150 requests per batch)
  const concurrency = 30
  const batchSize = concurrency
  const delayBetweenBatches = 60000 / (RATE_LIMIT_PER_MINUTE / 5) * batchSize // milliseconds
  
  let totalMakerFee = 0
  let totalTakerFee = 0
  let totalTransferFee = 0
  let totalWithdrawFee = 0
  let processedCount = 0

  await PromisePool.withConcurrency(concurrency)
    .for(markets)
    .process(async (market: OrderBookDetail) => {
      const [makerFee, takerFee, transferFee, withdrawFee] = await Promise.all([
        fetchExchangeMetricByMarket('maker_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('taker_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('transfer_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('withdraw_fee', market.symbol, options.startOfDay),
      ])

      totalMakerFee += makerFee
      totalTakerFee += takerFee
      totalTransferFee += transferFee
      totalWithdrawFee += withdrawFee
      
      processedCount++
      
      // Add delay after each batch to respect rate limits
      if (processedCount % batchSize === 0 && processedCount < markets.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
      }
    })

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
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  start: '2025-10-22',
  methodology,
  breakdownMethodology,
}

export default adapter
