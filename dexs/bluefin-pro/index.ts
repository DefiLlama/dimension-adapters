import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { tickerToCgId } from "../../helpers/coingeckoIds";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const exchangeInfo = (await httpGet(`https://api.sui-prod.bluefin.io/v1/exchange/info`))
  const dailyVolume = options.createBalances();

  for(const market of exchangeInfo.markets){
    if(market.status !== "ACTIVE") continue;
    const data = (await httpGet(`https://api.sui-prod.bluefin.io/v1/exchange/ticker?symbol=${market.symbol}`))
    const ticker = market.baseAssetSymbol
    const cgId = tickerToCgId[ticker];
    if (cgId) {
      dailyVolume.addCGToken(cgId, Number(data.volume24hrE9) / 1e9);
    } else {
      dailyVolume.addUSDValue(Number(data.quoteVolume24hrE9) / 1e9);
    }
  }

  return { 
    dailyVolume 
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
