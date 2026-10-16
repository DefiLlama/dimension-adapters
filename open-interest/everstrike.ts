import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_BASE = "https://api.everstrike.io";

interface Pair {
  category?: string;
  status?: string;
}

interface PairsResponse {
  code: number;
  result: Record<string, Pair>;
}

interface Ticker {
  open_interest?: number | string | null;
  mark_price?: number | string | null;
}

const fetch = async (_options: FetchOptions) => {
  const pairsResponse = (await fetchURL(`${API_BASE}/pairs`)) as PairsResponse;
  if (pairsResponse?.code !== 200 || !pairsResponse.result || typeof pairsResponse.result !== "object") {
    throw new Error("Everstrike pairs API returned an invalid response");
  }

  const markets = Object.entries(pairsResponse.result).filter(
    ([, pair]) => pair.category === "future" && pair.status === "TRADING",
  );
  if (!markets.length) throw new Error("Everstrike pairs API returned no trading futures");

  const tickerResponse = (await fetchURL(`${API_BASE}/ticker`)) as Record<string, Ticker>;
  if (!tickerResponse || typeof tickerResponse !== "object" || Array.isArray(tickerResponse)) {
    throw new Error("Everstrike ticker API returned an invalid response");
  }

  let doubleSidedOpenInterestUSD = 0;
  for (const [market] of markets) {
    const ticker = tickerResponse[market];
    if (!ticker || typeof ticker !== "object" || Array.isArray(ticker)) {
      throw new Error(`Everstrike ticker is missing ${market}`);
    }

    // Everstrike confirmed omitted OI means no open positions for that market.
    if (ticker.open_interest === undefined) continue;
    if (ticker.open_interest === null || (typeof ticker.open_interest === "string" && !ticker.open_interest.trim())) {
      throw new Error(`Everstrike returned invalid open interest for ${market}`);
    }

    const openInterest = Number(ticker.open_interest);
    if (!Number.isFinite(openInterest) || openInterest < 0) {
      throw new Error(`Everstrike returned invalid open interest for ${market}`);
    }
    if (openInterest === 0) continue;

    const markPrice = Number(ticker.mark_price);
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      throw new Error(`Everstrike returned invalid mark price for ${market} with open interest`);
    }
    doubleSidedOpenInterestUSD += openInterest * markPrice;
  }

  // Everstrike's field counts both long and short sides of each open contract.
  return { openInterestAtEnd: doubleSidedOpenInterestUSD / 2 };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  // The API only serves a current snapshot; hourly values must not be summed.
  pullHourly: false,
  fetch,
  methodology: {
    OpenInterest:
      "One-sided open interest for trading USD-margined perpetual futures: the underlying-asset amount for each market is valued at its current USD mark price, then divided by two because Everstrike's API counts both long and short sides. Markets omitting open_interest are treated as zero per Everstrike's confirmation.",
  },
};

export default adapter;
