import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

const BASE_URL = "https://llama.astros.ag/api/third/info";

const methodology = {
  Volume: "Volume of all perpetual contract trades executed.",
  Fees: "Trading fees paid by users.",
  Revenue: "Trading fees paid by users are revenue.",
};

const getHeaders = () => ({
  "api-key": getEnv("ASTROS_PERP_API_KEY"),
});

const fetch = async () => {
  let dailyVolume = 0
  let dailyFees = 0
  
  const pairs = await httpGet(`${BASE_URL}/pairs`, { headers: getHeaders() })

  const tradablePairs = pairs.data.filter((pair: any) => pair.tradable);

  for (const pair of tradablePairs) {
    const ticker: any = await httpGet(
      `${BASE_URL}/ticker/24hr?pairName=${pair.symbol}`,
      { headers: getHeaders() }
    );
    
    dailyVolume += Number(ticker.data.amount)
    
    const feeRate = (Number(pair.takerTradeFeeRate) + Number(pair.makerTradeFeeRate)) / 100;
    dailyFees += feeRate * Number(ticker.data.amount)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
