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

/** Reads the value for `startOfDay` from an exchangeMetrics response. Throws on a
 * malformed response (missing / non-array `metrics`) so an outage or schema
 * change surfaces instead of silently underreporting fees as zero; returns 0
 * only when the series simply has no entry for that day (a genuine no-fee day). */
function pickDailyValue(res: ExchangeMetricResponse, startOfDay: number, label: string): number {
  if (!res || !Array.isArray(res.metrics)) {
    throw new Error(`Lighter Robinhood exchangeMetrics returned an unexpected shape for ${label}`)
  }
  const metric = res.metrics.find((m) => m.timestamp === startOfDay)
  return metric ? Number(metric.data) : 0
}

async function fetchMetricByMarket(kind: string, symbol: string, startOfDay: number): Promise<number> {
  const res: ExchangeMetricResponse = await fetchURLAutoHandleRateLimit(
    `${API_BASE}/exchangeMetrics?period=all&kind=${kind}&filter=byMarket&value=${encodeURIComponent(symbol)}`
  )
  return pickDailyValue(res, startOfDay, `${kind} (${symbol})`)
}

async function fetchMetricGlobal(kind: string, startOfDay: number): Promise<number> {
  const res: ExchangeMetricResponse = await fetchURL(`${API_BASE}/exchangeMetrics?period=all&kind=${kind}`)
  return pickDailyValue(res, startOfDay, kind)
}

/** Perp markets only. Lighter's Robinhood spot markets (e.g. NVDA/USDG) are a
 * separate protocol (dexs/lighter-spot), and the unfiltered exchangeMetrics
 * value is the perp+spot total — so fees are scoped to the active perp markets,
 * exactly like mainnet Lighter (fees/lighterv2). */
async function getActivePerpMarkets(): Promise<OrderBookDetail[]> {
  const res: { order_book_details?: OrderBookDetail[] } = await fetchURL(`${API_BASE}/orderBookDetails`)
  return (res?.order_book_details || []).filter((m) => m.market_type === 'perp' && m.status === 'active')
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const markets = await getActivePerpMarkets()
  options.api.log('Lighter Robinhood active perp markets #', markets.length)

  // Build every request up-front and run them through one bounded pool so
  // concurrency and upstream rate-limiting stay explicit: per-market maker /
  // taker / liquidation fees + account-level transfer / withdraw fees.
  const tasks: Array<{ kind: string; symbol?: string }> = []
  for (const market of markets) {
    tasks.push({ kind: 'maker_fee', symbol: market.symbol })
    tasks.push({ kind: 'taker_fee', symbol: market.symbol })
    tasks.push({ kind: 'liquidation_fee', symbol: market.symbol })
  }
  tasks.push({ kind: 'transfer_fee' })
  tasks.push({ kind: 'withdraw_fee' })

  const totals: Record<string, number> = {
    maker_fee: 0, taker_fee: 0, liquidation_fee: 0, transfer_fee: 0, withdraw_fee: 0,
  }

  await PromisePool.withConcurrency(3)
    .handleError((error) => { throw error }) // propagate malformed-data / outage failures
    .for(tasks)
    .process(async (task) => {
      const value = task.symbol
        ? await fetchMetricByMarket(task.kind, task.symbol, options.startOfDay)
        : await fetchMetricGlobal(task.kind, options.startOfDay)
      totals[task.kind] += value
    })

  const tradingFees = totals.maker_fee + totals.taker_fee

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Protocol revenue: maker, taker, transfer and withdrawal fees.
  dailyRevenue.addUSDValue(tradingFees, METRIC.TRADING_FEES)
  dailyRevenue.addUSDValue(totals.transfer_fee, 'Transfer Fees')
  dailyRevenue.addUSDValue(totals.withdraw_fee, METRIC.DEPOSIT_WITHDRAW_FEES)

  // Liquidation fees go to the Lighter Liquidity Pool (LLP) — the supply side
  // (liquidity providers), not the protocol. Booking them here keeps
  // dailyFees = dailyRevenue + dailySupplySideRevenue.
  dailySupplySideRevenue.addUSDValue(totals.liquidation_fee, METRIC.LIQUIDATION_FEES)

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
  Fees: 'All fees paid by traders on the Lighter Robinhood perpetuals deployment: maker, taker, transfer, withdrawal and liquidation fees. Scoped to perp markets (spot is tracked separately as lighter-spot).',
  Revenue: 'Protocol revenue from maker, taker, transfer and withdrawal fees. Liquidation fees are excluded — they go to the LLP (see SupplySideRevenue).',
  ProtocolRevenue: 'Same as Revenue: maker, taker, transfer and withdrawal fees retained by the protocol.',
  SupplySideRevenue: 'Liquidation fees, which are paid to the Lighter Liquidity Pool (LLP) — i.e. to liquidity providers, not the protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees from perpetual trading (summed across active perp markets).',
    'Transfer Fees': 'Transfer fees paid by traders on Lighter.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees paid by traders on Lighter.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid by traders, routed to the LLP.',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees retained by the protocol.',
    'Transfer Fees': 'Transfer fees retained by the protocol.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees retained by the protocol.',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'Maker and taker fees retained by the protocol.',
    'Transfer Fees': 'Transfer fees retained by the protocol.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees retained by the protocol.',
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
