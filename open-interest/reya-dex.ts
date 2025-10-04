import fetchURL from "../utils/fetchURL"
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const marketsEndpoint = "https://api.reya.xyz/api/markets"

const fetch = async (_a: any) => {
  const markets = (await fetchURL(marketsEndpoint))

  let openInterestAtEnd = 0
  let longOpenInterestAtEnd = 0
  let shortOpenInterestAtEnd = 0

  for (const market of markets) {
    if (market.isActive !== true) continue
    openInterestAtEnd += Number(market.openInterest) * Number(market.markPrice)
    longOpenInterestAtEnd += Number(market.longOI) * Number(market.markPrice)
    shortOpenInterestAtEnd += Number(market.shortOI) * Number(market.markPrice)
  }

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.REYA]: {
      fetch,
      runAtCurrTime: true,
      start: "2024-03-20",
    },
  },
};

export default adapter; 