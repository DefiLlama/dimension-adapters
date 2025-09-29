import fetchURL from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
// historicalVolumeEndpoint also has the OI data, but its very heavy endpoint
const marketsEndpoint = "https://api.prod.paradex.trade/v1/markets"
const marketsSummaryEndpoint = (market: string) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}`

const fetch = async (_a: FetchOptions) => {
  const markets = (await fetchURL(marketsEndpoint)).results
  console.log(markets.length)

  let openInterestAtEnd = 0
  for (const market of markets) {
    if (market.asset_kind !== 'PERP') continue
    const openInterest = (await fetchURL(marketsSummaryEndpoint(market.symbol))).results[0]
    openInterestAtEnd += Number(openInterest.open_interest)
  }

  return { openInterestAtEnd }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-09-01',
    },
  },
};

export default adapter; 