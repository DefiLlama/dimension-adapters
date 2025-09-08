import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function historicFetch(options: FetchOptions) {
  const data = await httpGet(`https://kalshi-public-docs.s3.amazonaws.com/reporting/market_data_${options.dateString}.json`)
  let dailyVolume = 0
  let openInterestAtEnd = 0
  for (const market of data) {
    dailyVolume += market.daily_volume
    openInterestAtEnd += market.open_interest
  }
  return { dailyVolume, openInterestAtEnd }
}

export default {
  start: '2021-06-30',
  chains: [CHAIN.KALSHI],
  fetch: async (_: any, _1: any, options: FetchOptions) => {
    return historicFetch(options)
  }
}