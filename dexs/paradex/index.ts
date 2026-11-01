import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PARADEX_DAILY_VOLUME_CARD, PARADEX_TRADES_FROM, getParadexDailyCardValue, getParadexMarkets, getParadexTrades, isParadexDailyCardSlot } from "../../helpers/paradex";

// This listing is perps volume only; spot and options are separate listings.
// Summing every perp trade matches the dashboard PERP_VOLUME to the cent on 2026-10-10 and 10-30.
const PERP_VOLUME_INDEX = 1

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.startTimestamp >= PARADEX_TRADES_FROM) {
    const markets = await getParadexMarkets('PERP')
    let dailyVolume = 0
    for (const { symbol } of markets) {
      const trades = await getParadexTrades(options, `market=${symbol}`)
      for (const trade of trades) dailyVolume += Number(trade.price) * Number(trade.size)
    }
    return { dailyVolume }
  }

  if (!isParadexDailyCardSlot(options)) return { dailyVolume: 0 }
  return { dailyVolume: await getParadexDailyCardValue(PARADEX_DAILY_VOLUME_CARD, options, PERP_VOLUME_INDEX) }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
  methodology: {
    Volume: 'Perpetual futures trading volume on Paradex, counted once on the taker side. From 2026-10-31 it sums trades from the public Paradex trades API; earlier days come from the daily PERP_VOLUME of the Paradex stats dashboard.',
  },
}

export default adapter
