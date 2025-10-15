import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const exchangeInfo = (await httpGet(`https://api.sui-prod.bluefin.io/v1/exchange/info`))
  let volume = 0;
  for(const market of exchangeInfo.markets){
    const {quoteVolume24hrE9} = (await httpGet(`https://api.sui-prod.bluefin.io/v1/exchange/ticker?symbol=${market.symbol}`))
    volume += Number(quoteVolume24hrE9)
  }

  return {
    dailyVolume: volume/1e9,
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
