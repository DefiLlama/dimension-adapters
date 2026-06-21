import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const MARKETS_URL = "https://api.obsdn.trade/markets";

const fetch = async (_options: FetchOptions) => {
  const res = await httpGet(MARKETS_URL);
  const markets: any[] = res.data.mkts;

  let openInterestAtEnd = 0;
  for (const m of markets) {
    openInterestAtEnd += Number(m.oi);
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  runAtCurrTime: true,
};

export default adapter;
