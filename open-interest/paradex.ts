import fetchURL from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
// historicalVolumeEndpoint also has the OI data, but its very heavy endpoint
const marketsSummaryEndpoint = "https://api.prod.paradex.trade/v1/markets/summary?MARKET=ALL"

const fetch = async (_a: FetchOptions) => {
  const markets = (await fetchURL(marketsSummaryEndpoint)).results;

  const openInterestAtEnd = markets.reduce((acc: number, market: any) => acc + +(market.open_interest || 0) * +(market.underlying_price||0),0);

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