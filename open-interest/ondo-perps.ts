import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";


const API = "https://api.ondoperps.xyz/v1/perps/open_interest";

type OpenInterestItem = {
  market: string;
  openInterest: string;
  notionalValue: string;
};

const fetch = async (_options: FetchOptions) => {
  const response = await fetchURL(API);
  // notionalValue is long+short summed, halve it for the one-sided convention
  const openInterestAtEnd = response.result.reduce((acc: number, market: OpenInterestItem) => acc + Number(market.notionalValue), 0) / 2
  return { openInterestAtEnd }
}

const methodology = {
  OpenInterest:
    "Open interest is the sum of notionalValue from Ondo Perps's open interest API, halved because that field sums long and short.",
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: "2026-03-17", // Matched with OHLCV first candle
    runAtCurrTime: true,
    methodology,
};

export default adapter;
