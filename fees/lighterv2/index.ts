import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL from '../../utils/fetchURL'

const TREASURY_ACCOUNT_INDEX = 0
const MAX_LOGS_PER_REQUEST = 100
const BUYBACK_MARKET_INDEX = 2049
const BUYBACK_TAKER_ASK = 0
const MAX_LOG_OFFSET = 20000

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

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const todayStart = new Date(options.startOfDay * 1000).toISOString()
  const todayEnd = new Date(options.endTimestamp * 1000).toISOString()

  // Fetch fees from lightalytics API
  const result = (
    await fetchURL(
      `https://lightalytics.com/api/v1/stats/network/fees_history?exchange=lighter&from=${todayStart}&to=${todayEnd}&interval=1d&value=period`
    )
  ).series
  const dailyFeesValue = parseFloat(result[0].revenue_24h_usd)

  // Fetch buybacks from explorer API
  const dailyBuybackUsd = await fetchBuybacks(options.startOfDay, options.endTimestamp)

  // Create balances
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyFees.addUSDValue(dailyFeesValue, METRIC.TRADING_FEES)
  dailyRevenue.addUSDValue(dailyFeesValue, METRIC.TRADING_FEES)
  dailyProtocolRevenue.addUSDValue(dailyFeesValue, METRIC.TRADING_FEES)

  if (dailyBuybackUsd > 0) {
    dailyHoldersRevenue.addUSDValue(dailyBuybackUsd, METRIC.TOKEN_BUY_BACK)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'Maker and taker fees paid by premium accounts on the Lighter DEX',
  Revenue: 'All trading fees are protocol revenue',
  ProtocolRevenue: 'All trading fees go to the protocol treasury',
  HoldersRevenue:
    'LIT token buybacks executed by the treasury account. The protocol uses fees to buy back LIT tokens from the market.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from spot and perpetual trading',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'All trading fees are protocol revenue',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'Trading fees collected by the protocol',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]:
      'LIT token buybacks from treasury account trades. Buybacks can be tracked at https://app.lighter.xyz/explorer/accounts/0',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZK_LIGHTER]: {
      fetch,
      start: '2025-10-22',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter
