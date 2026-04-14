import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const EXCHANGE_INFO_URL = "https://x.rho.trading/api/v1/exchange/info";
const TICKERS_URL = "https://x.rho.trading/api/v1/tickers";

const fetch = async () => {
  const exchangeInfo = await fetchURL(EXCHANGE_INFO_URL);
  const active_pairs = Array.isArray(exchangeInfo?.symbols)
    ? exchangeInfo.symbols.filter((symbolRecord: any) => symbolRecord && symbolRecord.isExpired === false)
    : []; 

  const query = new URLSearchParams();
  active_pairs.forEach((symbol) => query.append("symbols[]", symbol));
  const tickerResponse = await fetchURL(`${TICKERS_URL}?${query.toString()}`);

  let openInterestAtEnd = 0;
  for (const ticker of tickerResponse.tickers) {
    if(ticker.lastOpenInterest === null || ticker.lastOpenInterest === undefined) continue;
    openInterestAtEnd += Number(ticker.lastOpenInterest);
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  runAtCurrTime: true,
};

export default adapter;