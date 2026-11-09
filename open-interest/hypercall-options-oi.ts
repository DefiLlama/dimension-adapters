import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const endpoint = "https://api.hypercall.xyz/markets?include_instruments=false";

const fetch = async () => {
  const response = await fetchURL(endpoint);
  if (!response.success || !Array.isArray(response.data) || !response.data.length)
    throw new Error("Missing Hypercall options markets");

  let openInterestAtEnd = 0;
  for (const market of response.data) {
    const contracts = Number(market.total_open_interest);
    if (!Number.isFinite(contracts) || contracts < 0)
      throw new Error(`Invalid open interest for ${market.underlying}`);
    if (!contracts) continue;

    const underlyingPrice = Number(market.index_price);
    if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0)
      throw new Error(`Invalid index price for ${market.underlying}`);
    openInterestAtEnd += contracts * underlyingPrice;
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  runAtCurrTime: true,
  pullHourly: false,
  methodology: {
    OpenInterest: "Current USD notional of outstanding options: each market's total_open_interest in contracts times its underlying index price. A daily snapshot is not the sum of hourly OI.",
  },
};

export default adapter;
