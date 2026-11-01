import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getParadexMarkets, getParadexTrades } from "../../helpers/paradex";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const markets = await getParadexMarkets('SPOT')
  let dailyVolume = 0
  for (const { symbol } of markets) {
    const trades = await getParadexTrades(options, `market=${symbol}`)
    for (const trade of trades) dailyVolume += Number(trade.price) * Number(trade.size)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.PARADEX],
  fetch,
  start: '2026-02-04',
  methodology: {
    Volume: 'Spot trading volume on Paradex: the notional value of every spot trade, counted once on the taker side, from the public Paradex trades API.',
  },
}

export default adapter;
