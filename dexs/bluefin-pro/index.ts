import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const fetch = async () => {
  const exchangeInfo = (await fetchURLAutoHandleRateLimit(`https://api.sui-prod.bluefin.io/v1/exchange/info`))
  const tickers = (await fetchURLAutoHandleRateLimit(`https://api.sui-prod.bluefin.io/v1/exchange/tickers`))
  const activeMarkets = new Set(exchangeInfo.markets.filter((market: any) => market.status === "ACTIVE").map((market: any) => market.symbol));
  let volume = 0;
  let openInterest = 0;
  for(const { symbol, quoteVolume24hrE9, openInterestE9 } of tickers){
    if(!activeMarkets.has(symbol)) continue;
    volume += Number(quoteVolume24hrE9)
    openInterest += Number(openInterestE9)
  }

  return {
    dailyVolume: volume/1e9,
    openInterestAtEnd: openInterest / 1e9,
  };
};


const adapter: SimpleAdapter = {
    adapter:{
        [CHAIN.SUI]:{
            fetch: fetch,
            runAtCurrTime: true
        }
    }
};

export default adapter;
