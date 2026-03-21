import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
import { METRIC } from "../helpers/metrics";

const BASE_URL = "https://llama.astros.ag/api/third/info";

const methodology = {
  Volume: "Volume of all perpetual contract trades executed.",
  Fees: "Trading fees paid by users.",
  Revenue: "Trading fees paid by users are revenue.",
};

const getHeaders = () => ({
  "api-key": getEnv("ASTROS_PERP_API_KEY"),
});

const fetch = async (_a: any, _t: any, options: FetchOptions) => {
  let dailyVolume = 0
  const dailyFees = options.createBalances()
  
  const pairs = await httpGet(`${BASE_URL}/pairs`, { headers: getHeaders() })

  const tradablePairs = pairs.data.filter((pair: any) => pair.tradable);

  for (const pair of tradablePairs) {
    const ticker: any = await httpGet(
      `${BASE_URL}/ticker/24hr?pairName=${pair.symbol}`,
      { headers: getHeaders() }
    );
    
    dailyVolume += Number(ticker.data.amount)
    
    const feeRate = (Number(pair.takerTradeFeeRate) + Number(pair.makerTradeFeeRate)) / 100;
    dailyFees.addUSDValue(feeRate * Number(ticker.data.amount), METRIC.TRADING_FEES)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Trading fees paid by users"
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Trading fees paid by users are revenue"
    }
  },
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
