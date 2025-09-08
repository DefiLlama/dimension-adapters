import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

export default {
  runAtCurrTime: true,
  version: 2,
  chains: [CHAIN.KALSHI],
  fetch: async (options: FetchOptions) => {
    const url = "https://api.elections.kalshi.com/trade-api/v2/markets"
    let cursor: any = undefined
    let dailyVolume = 0
    let openInterestAtEnd = 0


    do {
      const { data } = await axios.get(url, {
        params: {
          cursor,
          limit: 1000,
          status: 'open,closed,settled', // https://docs.kalshi.com/api-reference/market/get-markets#parameter-status
          min_close_ts: options.fromTimestamp // filter for only markets that close only after our start time
        }
      })
      options.api.log(`fetched ${data.markets.length} markets from kalshi with cursor ${data.cursor}`)
      cursor = data.cursor

      for (const market of data.markets) {
        dailyVolume += market.volume_24h
        openInterestAtEnd += market.open_interest
      }
    } while (cursor);

    return { dailyVolume, openInterestAtEnd }
  }
}