import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_: any) => {
  let openInterestAtEnd = 0;

  const data = await fetchURL('https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails');
  const markets = data.order_book_details;
  markets.forEach((market: any) => {
    openInterestAtEnd += (Number(market.open_interest || 0) * Number(market.last_trade_price || 0) * 2); // * 2 because of double sided OI
  });

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  runAtCurrTime: true,
  start: "2025-01-17",
};

export default adapter;
