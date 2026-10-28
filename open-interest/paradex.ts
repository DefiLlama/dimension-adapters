import fetchURL from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
// historicalVolumeEndpoint also has the OI data, but its very heavy endpoint
const marketsSummaryEndpoint = "https://api.prod.paradex.trade/v1/markets/summary?MARKET=ALL"

const fetch = async (_a: FetchOptions) => {
  const markets = (await fetchURL(marketsSummaryEndpoint)).results;

  // summary?MARKET=ALL returns perp, option and spot markets; options OI is tracked in options/paradex, so keep only perps (symbol ends with -PERP, e.g. BTC-USD-PERP)
  // venue open_interest is long+short, so divide by 2 to count each contract once
  const openInterestAtEnd = markets
    .filter((market: any) => market.symbol?.endsWith('-PERP'))
    .reduce((acc: number, market: any) => acc + +(market.open_interest || 0) * +(market.underlying_price || 0), 0) / 2;

  return { openInterestAtEnd }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PARADEX],
  start: '2023-09-01',
  runAtCurrTime: true
};

export default adapter; 