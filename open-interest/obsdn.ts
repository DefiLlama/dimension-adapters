import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const MARKETS_URL = "https://api.obsdn.trade/markets";

const fetch = async (_options: FetchOptions) => {
  const res = await httpGet(MARKETS_URL);
  const markets: any[] = res.data?.mkts ?? [];

  let openInterestAtEnd = 0;
  for (const m of markets) {
    // oi is double-sided (long + short), divide by 2 for single-sided
    openInterestAtEnd += Number(m.oi) / 2;
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-06-20",
};

export default adapter;
