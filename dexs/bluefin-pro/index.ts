import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const exchangeInfo = (await fetchURLAutoHandleRateLimit(`https://api.sui-prod.bluefin.io/v1/exchange/info`))
  const tickers = (await fetchURLAutoHandleRateLimit(`https://api.sui-prod.bluefin.io/v1/exchange/tickers`))
  const activeMarkets = new Set(exchangeInfo.markets.filter((market: any) => market.status === "ACTIVE").map((market: any) => market.symbol));
  const dailyVolume = options.createBalances();
  let openInterest = 0;
  for(const { symbol, quoteVolume24hrE9, openInterestE9 } of tickers){
    if(!activeMarkets.has(symbol)) continue;
    const baseAsset = symbol.split("-")[0]; // e.g. "BTC-PERP" -> "BTC"
    dailyVolume.addUSDValue(Number(quoteVolume24hrE9) / 1e9, { id: baseAsset, isUSDValue: true });
    openInterest += Number(openInterestE9) / 1e9;
  }
  return { dailyVolume, openInterestAtEnd: openInterest };
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
