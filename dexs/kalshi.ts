import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch(_a:number, _b:any, options: FetchOptions) {
  const startDate = options.startOfDay - (24 * 3600);
  const dateString = new Date(startDate * 1000).toISOString().split('T')[0]
  const url = `https://kalshi-public-docs.s3.amazonaws.com/reporting/market_data_${dateString}.json`
  const data = await fetchURL(url)

  let dailyVolume = 0
  let openInterestAtEnd = 0

  for (const market of data) {
    dailyVolume += Number(market.daily_volume)
    if (market.status !== 'active') continue // the market might have settled in the past24 hours
    openInterestAtEnd += Number(market.open_interest)
  }

  return { dailyVolume, openInterestAtEnd }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: '2021-06-30',
}

export default adapter;
