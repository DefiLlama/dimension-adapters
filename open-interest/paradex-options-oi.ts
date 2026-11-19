import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const endpoint = "https://api.prod.paradex.trade/v1/markets/summary?market=ALL";

const fetch = async () => {
  const response = await fetchURL(endpoint);
  if (!Array.isArray(response.results)) throw new Error("Missing Paradex market summaries");

  const options = response.results.filter((market: any) => /-[CP]$/.test(market.symbol || ""));
  if (!options.length) throw new Error("No Paradex option markets in summary");

  let grossOpenInterest = 0;
  for (const market of options) {
    const contracts = Number(market.open_interest);
    if (!Number.isFinite(contracts) || contracts < 0) throw new Error(`Invalid open interest for ${market.symbol}`);
    if (!contracts) continue;

    const underlyingPrice = Number(market.underlying_price);
    if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0)
      throw new Error(`Invalid underlying price for ${market.symbol}`);
    grossOpenInterest += contracts * underlyingPrice;
  }

  return { openInterestAtEnd: grossOpenInterest / 2 };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PARADEX],
  runAtCurrTime: true,
  pullHourly: false,
  methodology: {
    OpenInterest: "Current USD notional of outstanding dated options. Paradex reports both position sides in open_interest; divide by two to count each matched contract once, then multiply by the underlying price. A daily snapshot is not the sum of hourly OI.",
  },
};

export default adapter;
