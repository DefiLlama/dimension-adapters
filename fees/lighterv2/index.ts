import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'
import PromisePool from '@supercharge/promise-pool'

const TREASURY_ACCOUNT_INDEX = 0
const MAX_LOGS_PER_REQUEST = 100
const BUYBACK_MARKET_INDEX = 2049
const BUYBACK_TAKER_ASK = 0
const MAX_LOG_OFFSET = 20000
const API_BASE = 'https://mainnet.zklighter.elliot.ai/api/v1'
const RATE_LIMIT_PER_MINUTE = 200

interface LogEntry {
  time: string
  pubdata: {
    trade_pubdata?: {
      market_index: number
      is_taker_ask: number
      price: string
      size: string
    }
  }
}

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
  order_book_details: OrderBookDetail[]
}

/** Fetches LIT buyback USD value from treasury account trades within a time range
 * https://apidocs.lighter.xyz/reference/get_accounts-param-logs
 * All trades from this account are LIT/USDC buybacks (market_index 2049)
 * Treasury is taker and buying when is_taker_ask = 0
 */
async function fetchBuybacks(startTimestamp: number, endTimestamp: number): Promise<number> {
  const startMs = startTimestamp * 1000
  const endMs = endTimestamp * 1000

  let totalBuybackUsd = 0

  for (let offset = 0; offset <= MAX_LOG_OFFSET; offset += MAX_LOGS_PER_REQUEST) {
    const url = `https://explorer.elliot.ai/api/accounts/${TREASURY_ACCOUNT_INDEX}/logs?pub_data_type=Trade&limit=${MAX_LOGS_PER_REQUEST}&offset=${offset}`
    const logs: LogEntry[] = await fetchURL(url)

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      break
    }

    for (const log of logs) {
      const logTimeMs = Date.parse(log.time)
      if (!Number.isFinite(logTimeMs)) {
        continue
      }

      // Skip if after our time range (logs are newest-first)
      if (logTimeMs > endMs) {
        continue
      }

      // Logs are newest-first, so stop once before the range
      if (logTimeMs < startMs) {
        return totalBuybackUsd
      }

      const trade = log.pubdata?.trade_pubdata
      if (!trade) continue

      if (Number(trade.market_index) !== BUYBACK_MARKET_INDEX) continue
      if (Number(trade.is_taker_ask) !== BUYBACK_TAKER_ASK) continue

      const price = Number(trade.price)
      const size = Number(trade.size)
      if (!Number.isFinite(price) || !Number.isFinite(size)) continue
      totalBuybackUsd += price * size
    }

    if (logs.length < MAX_LOGS_PER_REQUEST) break
  }

  return totalBuybackUsd
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

async function getActivePerpMarkets(api: any): Promise<OrderBookDetail[]> {
  const response: OrderBookDetailsResponse = await fetchURL(`${API_BASE}/orderBookDetails`)
  
  if (!response?.order_book_details || !Array.isArray(response.order_book_details)) {
    return []
  }

  // Filter for active perp markets only
  const activePerpMarkets = response.order_book_details.filter(
    market => market.market_type === 'perp' && market.status === 'active'
  )

  api.log('Active perp markets #', activePerpMarkets.length)
  
  return activePerpMarkets
}

async function fetch(_: any, _1: any, options: FetchOptions): Promise<FetchResultV2> {
  // Get all active perp markets
  const markets = await getActivePerpMarkets(options.api)
  
  // Calculate concurrency based on rate limit
  // 5 fee types per market, 200 requests per minute limit
  // Use concurrency of 30 to be safe (30 * 5 = 150 requests per batch)
  const concurrency = 5
  const batchSize = concurrency
  const delayBetweenBatches = 60000 / (RATE_LIMIT_PER_MINUTE / 5) * batchSize // milliseconds
  
  let totalMakerFee = 0
  let totalTakerFee = 0
  let totalTransferFee = 0
  let totalWithdrawFee = 0
  let totalLiquidationFee = 0
  let processedCount = 0

  // Fetch fees for each market
  await PromisePool.withConcurrency(concurrency)
    .for(markets)
    .process(async (market: OrderBookDetail) => {
      const [makerFee, takerFee, transferFee, withdrawFee, liquidationFee] = await Promise.all([
        fetchExchangeMetricByMarket('maker_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('taker_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('transfer_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('withdraw_fee', market.symbol, options.startOfDay),
        fetchExchangeMetricByMarket('liquidation_fee', market.symbol, options.startOfDay),
      ])

      totalMakerFee += makerFee
      totalTakerFee += takerFee
      totalTransferFee += transferFee
      totalWithdrawFee += withdrawFee
      totalLiquidationFee += liquidationFee
      
      processedCount++
      
      // Add delay after each batch to respect rate limits
      if (processedCount % batchSize === 0 && processedCount < markets.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
      }
    })

  const tradingFees = totalMakerFee + totalTakerFee

  // Fetch buybacks from explorer API
  const dailyBuybackUsd = await fetchBuybacks(options.startOfDay, options.endTimestamp)

  // Create balances
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyRevenue.addUSDValue(tradingFees, METRIC.TRADING_FEES)
  dailyRevenue.addUSDValue(totalTransferFee, 'Transfer Fees')
  dailyRevenue.addUSDValue(totalWithdrawFee, METRIC.DEPOSIT_WITHDRAW_FEES)
  dailyFees.addUSDValue(totalLiquidationFee, METRIC.LIQUIDATION_FEES)
  dailyFees.addBalances(dailyRevenue)

  if (dailyBuybackUsd > 0) {
    dailyHoldersRevenue.addUSDValue(dailyBuybackUsd, METRIC.TOKEN_BUY_BACK)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'Maker and taker fees paid by traders on the Lighter DEX',
  Revenue: 'Protocol revenue from maker fees, taker fees, transfer fees, and withdraw fees. Liquidation fees are excluded as they go directly to LLP.',
  ProtocolRevenue: 'All trading and operational fees collected by the protocol treasury',
  HoldersRevenue: 'LIT token buybacks from treasury. The protocol uses fees to buy back LIT tokens from the market.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from perpetual trading.',
    'Transfer Fees': 'Transfer fees paid by traders on the Lighter DEX',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdraw fees paid by traders on the Lighter DEX',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid by traders on the Lighter DEX',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]:
      'LIT token buybacks from treasury. Buybacks can be tracked at https://app.lighter.xyz/explorer/accounts/0',
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
