import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_options: FetchOptions) => {
  const tickers = await httpGet("https://api.gateperps.com/api/v4/dex_futures/usdt/tickers");

  let openInterestAtEnd = 0;
  for (const ticker of tickers) {
    openInterestAtEnd += Number(ticker.total_size) * Number(ticker.quanto_multiplier) * Number(ticker.mark_price);
  }

  if (!openInterestAtEnd)
    throw new Error("No open interest data found");

  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.GATE_LAYER],
  runAtCurrTime: true,
};

export default adapter;
