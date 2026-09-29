import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://data.velocity.exchange/stats/markets";

interface Market {
  marketType: string;
  quoteAsset: string;
  markPrice: string;
  openInterest: { long: string; short: string };
}

interface MarketsResponse {
  success: boolean;
  markets: Market[];
}

const fetch = async (_options: FetchOptions) => {
  const response: MarketsResponse = await fetchURL(API_URL);
  if (!response.success || !Array.isArray(response.markets)) {
    throw new Error("Velocity markets API returned an invalid markets list");
  }

  const perpMarkets = response.markets.filter((market) => market.marketType === "perp");
  if (!perpMarkets.length) throw new Error("Velocity markets API returned no perp markets");

  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;
  for (const market of perpMarkets) {
    const long = Number(market.openInterest?.long);
    const short = Number(market.openInterest?.short);
    const price = Number(market.markPrice);
    if (market.quoteAsset !== "USDT" || typeof market.openInterest?.long !== "string" ||
        !market.openInterest.long.trim() || typeof market.openInterest?.short !== "string" ||
        !market.openInterest.short.trim() || typeof market.markPrice !== "string" ||
        !Number.isFinite(long) || !Number.isFinite(short) || !Number.isFinite(price) || price <= 0) {
      throw new Error("Velocity markets API returned invalid perp open interest or mark price");
    }
    longOpenInterestAtEnd += Math.abs(long) * price;
    shortOpenInterestAtEnd += Math.abs(short) * price;
  }

  return {
    openInterestAtEnd: (longOpenInterestAtEnd + shortOpenInterestAtEnd) / 2,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-07-06",
  runAtCurrTime: true,
  fetch,
  methodology: {
    OpenInterest: "One-sided open interest: half the sum of current long and short perp positions in base units, each valued at its market's mark price; spot markets are excluded.",
  },
};

export default adapter;
