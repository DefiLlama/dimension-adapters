import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PARADEX_DAILY_VOLUME_CARD, PARADEX_TRADES_FROM, getParadexDailyCardValue, getParadexMarkets, getParadexTrades, getParadexUnderlyingPrices, isParadexDailyCardSlot } from "../../helpers/paradex";

// Daily premium. Row format: [Day, Premium Volume, Cumulative Premium Volume]
const dailyPremiumEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/28546/card/32935?parameters=%5B%5D'
const OPTION_VOLUME_INDEX = 4

const NOTIONAL_TRADE_TYPES = new Set(['FILL', 'RPI', 'BLOCK_TRADE'])

const fetchFromTrades = async (options: FetchOptions) => {
  const markets = await getParadexMarkets('OPTION')
  const underlyings = [...new Set(markets.map((m: any) => m.base_currency as string))]
  let dailyNotionalVolume = 0
  let dailyPremiumVolume = 0
  for (const underlying of underlyings) {
    const trades = (await getParadexTrades(options, `base_asset=${underlying}`)).filter((t: any) => t.trade_type !== 'SETTLE_MARKET')
    if (!trades.length) continue

    const prices = await getParadexUnderlyingPrices(options, `${underlying}-USD-PERP`)
    for (const trade of trades) {
      dailyPremiumVolume += Number(trade.price) * Number(trade.size)
      if (!NOTIONAL_TRADE_TYPES.has(trade.trade_type)) continue
      const price = prices[Math.floor(trade.created_at / 60e3) * 60e3]
      if (price == null) throw new Error(`Missing ${underlying} underlying price at ${trade.created_at}`)
      dailyNotionalVolume += Number(trade.size) * price
    }
  }
  return { dailyNotionalVolume, dailyPremiumVolume }
}

const fetch = async (options: FetchOptions) => {
  if (options.startTimestamp >= PARADEX_TRADES_FROM) return fetchFromTrades(options)

  if (!isParadexDailyCardSlot(options)) return { dailyNotionalVolume: 0, dailyPremiumVolume: 0 }
  return {
    dailyNotionalVolume: await getParadexDailyCardValue(PARADEX_DAILY_VOLUME_CARD, options, OPTION_VOLUME_INDEX),
    dailyPremiumVolume: await getParadexDailyCardValue(dailyPremiumEndpoint, options, 1),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2026-03-25',
    },
  },
  methodology: {
    NotionalVolume: 'Notional value of options traded on Paradex: contracts traded times the underlying price. From 2026-10-31 it is computed from the public Paradex trades API and minute underlying prices; earlier days come from the Paradex stats dashboard.',
    PremiumVolume: 'Option premiums paid on Paradex, excluding expiry settlements. From 2026-10-31 it is summed from the public Paradex trades API; earlier days come from the Paradex stats dashboard.',
  },
}

export default adapter
