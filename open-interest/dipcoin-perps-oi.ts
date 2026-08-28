import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const API = "https://gray-api.dipcoin.io";

const fetch = async () => {
  const marketsRes = await fetchURLAutoHandleRateLimit(`${API}/api/perp-market-api/list`);
  const markets = marketsRes.data.filter((market: any) => market.status === 1 && market.visible !== false);
  let openInterest = 0;

  for (const market of markets) {
    const ticker = await fetchURLAutoHandleRateLimit(`${API}/api/perp-market-api/ticker?symbol=${encodeURIComponent(market.symbol)}`);
    openInterest += Number(ticker.data.openInterest) / 1e18;
  }

  return { openInterestAtEnd: openInterest };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
};

export default adapter;
