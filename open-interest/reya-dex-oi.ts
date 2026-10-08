import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Reya replaced the passive-perp AMM with an order book (perpOB): the AMM-era /v2/marketDefinitions
// route was removed and PassivePerpProxy.getMarketData / getInstantaneousPoolPrice now revert.
// Docs: https://docs.reya.xyz/developers/api-reference/rest-api-reference/market-data.md
const PERP_MARKETS_SUMMARY_ENDPOINT = "https://api.reya.xyz/v2/perpMarkets/summary";

type PerpMarketSummary = {
  symbol: string;
  oiQty: string; // total open interest quantity (one side of the matched book), in base units
  markPrice: string;
};

const fetch = async (_: FetchOptions) => {
  const markets: PerpMarketSummary[] = await fetchURL(PERP_MARKETS_SUMMARY_ENDPOINT);
  if (!Array.isArray(markets) || !markets.length) throw new Error("Reya perpMarkets/summary returned no markets");

  const openInterestAtEnd = markets.reduce((sum, { oiQty, markPrice }) => sum + Number(oiQty) * Number(markPrice), 0);

  // Matched book, so no long/short split is reported: it would be this number twice.
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.REYA],
  fetch,
  runAtCurrTime: true, // API only exposes a live snapshot
  start: "2026-03-11",
};

export default adapter;
