import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = 'https://api.perpetuals.polymarket.com/v1/info'

// both endpoints are rolling 24h snapshots with no history, hence runAtCurrTime
export const fetch = async (_: FetchOptions) => {
  const [stats, tickers] = await Promise.all([fetchURL(`${API}/statistics`), fetchURL(`${API}/tickers`)])

  let dailyVolume = 0
  for (const p of stats) dailyVolume += Number(p.volume) // quote (USD) notional

  let openInterestAtEnd = 0
  for (const t of tickers) openInterestAtEnd += Number(t.open_interest) * Number(t.mark_price) // OI is in contracts

  return { dailyVolume, openInterestAtEnd }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.POLYGON],
  methodology: {
    Volume: 'Rolling 24h trading volume in USD across all Polymarket Perps markets, from the perpetuals API statistics endpoint.',
    OpenInterest: 'Open interest in contracts per market times mark price, from the perpetuals API tickers endpoint.',
  },
}

export default adapter
