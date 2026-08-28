import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const chainConfig: Record<string, { api: string; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    api: "https://api.rh.lighter.xyz/api/v1",
    start: "2026-06-26",
  },
};

const fetch = async (options: FetchOptions) => {
  let openInterestAtEnd = 0;
  const { api } = chainConfig[options.chain];

  const data = await fetchURL(`${api}/orderBookDetails`);
  const markets = data.order_book_details;
  markets.forEach((market: any) => {
    openInterestAtEnd += (Number(market.open_interest || 0) * Number(market.last_trade_price || 0) * 2); // * 2 because of double sided OI
  });

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  runAtCurrTime: true,
};

export default adapter;
