// Changes to this adapter's revenue methodology require further approval before merging:
// a Trueo market depends on this data.

import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'
import PromisePool from '@supercharge/promise-pool'

// Lighter runs the same spot exchange on two deployments and dexs/lighter-spot already
// reports both; the fees side only ever read the zkLighter one. Account-level transfer/withdraw
// fees are exchange-wide and counted by fees/lighterv2 (zkLighter) and fees/lighter-rh (Robinhood),
// so only the per-market trading fees are taken here.
const chainConfig: Record<string, { API: string; start: string }> = {
  [CHAIN.ZK_LIGHTER]: { API: 'https://mainnet.zklighter.elliot.ai/api/v1', start: '2025-10-22' },
  [CHAIN.ROBINHOOD]: { API: 'https://api.rh.lighter.xyz/api/v1', start: '2026-06-26' },
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
  
  // Every market's series has an entry for every day of the deployment, so a missing one is missing data
  const metric = response?.metrics?.find(m => m.timestamp === startOfDay)
  if (!metric) throw new Error(`Lighter Spot: no ${kind} entry for ${symbol} at ${startOfDay}`)

  return metric.data
}

async function getActiveSpotMarkets(API_BASE: string, api: any): Promise<OrderBookDetail[]> {
  const response: OrderBookDetailsResponse = await fetchURL(`${API_BASE}/orderBookDetails`)
  
  if (!response?.spot_order_book_details || !Array.isArray(response.spot_order_book_details)) {
    throw new Error('Lighter Spot: orderBookDetails returned no spot markets list')
  }

  // Filter for active spot markets only
  const activeSpotMarkets = response.spot_order_book_details.filter(
    market => market.market_type === 'spot' && market.status === 'active'
  )

  api.log('Active spot markets #', activeSpotMarkets.length)
  
  return activeSpotMarkets
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { API: API_BASE } = chainConfig[options.chain]

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
    .handleError((error) => { throw error })
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

  const tradingFees = totalMakerFee + totalTakerFee

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(tradingFees, METRIC.TRADING_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Maker and taker fees paid by traders on Lighter spot markets. Transfer and withdraw fees are exchange-wide and counted under the perps listings.',
  Revenue: 'Protocol revenue from spot maker and taker fees.',
  ProtocolRevenue: 'All spot maker and taker fees collected by the protocol treasury',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from spot trading.',
  },
}

const adapter: SimpleAdapter = {
  note: "Changes to this adapter's revenue methodology require further approval before merging: a Trueo market depends on this data.",
  version: 1,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology,
  breakdownMethodology,
}

export default adapter
