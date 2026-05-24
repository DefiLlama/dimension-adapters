import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const MARKETS_API_URL = "https://api-perps.katana.network/v1/markets";

const fetch = async (_: FetchOptions) => {
  const markets = await fetchURLAutoHandleRateLimit(MARKETS_API_URL);
  const openInterestAtEnd = markets.reduce(
    (sum: number, market: any) => sum + Number(market.openInterest) * Number(market.indexPrice),
    0
  );

  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.KATANA],
  runAtCurrTime: true,
  start: "2026-01-12",
};

export default adapter;
