import { PromisePool } from '@supercharge/promise-pool'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'

const API_URL = 'https://mainnet-api1.bulk.trade/api/v1'
// Public mainnet launch: https://x.com/bulktrade/status/2096229604654551302.
// Candle range selection starts with the first complete minute at 13:31 UTC.
const MAINNET_VOLUME_START_TIMESTAMP = 1_788_615_060

interface Market {
  symbol: string
  quoteAsset: string
}

interface Candle {
  t: number
  T: number
  c: number
  v: number
}

const fetch = async (options: FetchOptions) => {
  const markets: unknown = await fetchURL(`${API_URL}/exchangeInfo`)
  if (!Array.isArray(markets))
    throw new Error('BULK exchangeInfo response is invalid')

  const symbols = [...new Set(markets
    .filter((market: Market) => market?.quoteAsset === 'USD')
    .map((market: Market) => market.symbol))]
  if (!symbols.length || symbols.some(symbol => typeof symbol !== 'string' || !symbol.length))
    throw new Error('BULK exchangeInfo response has no valid USD markets')

  const startTime = Math.max(options.startTimestamp, MAINNET_VOLUME_START_TIMESTAMP) * 1000
  const endTime = options.endTimestamp * 1000
  const { results, errors } = await PromisePool
    .withConcurrency(5)
    .useCorrespondingResults()
    .for(symbols)
    .process(async symbol => {
      const candles: unknown = await fetchURL(
        `${API_URL}/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${startTime}&endTime=${endTime}`,
      )
      if (!Array.isArray(candles))
        throw new Error(`BULK ${symbol} candle response is invalid`)

      let volume = 0
      let lastOpenTime = startTime - 1
      for (const candle of candles as Candle[]) {
        if (!Number.isFinite(candle?.t) || !Number.isFinite(candle?.T)
          || candle.t < startTime || candle.t >= endTime || candle.T <= candle.t || candle.T > endTime
          || candle.t <= lastOpenTime || !Number.isFinite(candle.c) || candle.c < 0
          || !Number.isFinite(candle.v) || candle.v < 0)
          throw new Error(`BULK ${symbol} candle response is invalid`)
        volume += candle.c * candle.v
        lastOpenTime = candle.t
      }
      if (!Number.isFinite(volume))
        throw new Error(`BULK ${symbol} candle volume is invalid`)
      return volume
    })
  if (errors.length)
    throw errors[0].raw ?? errors[0]

  const dailyVolume = results.reduce((sum, volume) => sum + volume, 0)
  if (!Number.isFinite(dailyVolume) || dailyVolume < 0)
    throw new Error('BULK aggregate candle volume is invalid')
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  // Twenty markets across 24 hourly slices triggers the public API's HTTP 429 limit; one daily
  // range keeps the run to one discovery request plus one bounded request per market.
  pullHourly: false,
  fetch,
  chains: [CHAIN.BULK],
  start: '2026-09-05',
  methodology: {
    Volume: 'One-sided perpetual volume for every trading USD market, calculated from BULK mainnet one-minute candles as base volume multiplied by each candle close price.',
  },
}

export default adapter
