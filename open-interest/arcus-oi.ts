import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/markets";

const fetch = async () => {
  const { markets } = await fetchURL(API);
  const openInterestAtEnd = markets
    .filter((market: any) => market.type === "PERPETUAL")
    .reduce((sum: number, market: any) => sum + Number(market.openInterest) * Number(market.markPrice), 0) / 2;

  // /v1/markets openInterest is long+short: measured 2x fill size on HOOD-USD (9/12 lags), and
  // CoinGecko independently carries 2.013x our halved figure across 57 markets.
  return { openInterestAtEnd };
};

const methodology = {
  OpenInterest: "Open interest is the sum of notional open interest from Arcus's markets API, halved because that field counts both the long and the short side of each contract.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-03",
  runAtCurrTime: true,
  methodology,
};

export default adapter;
