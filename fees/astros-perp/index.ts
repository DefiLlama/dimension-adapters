import {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";

const BASE_URL = "https://llama.astros.ag/api/third/info";

const methodology = {
  Fees: "Fees paid by users",
};

const getHeaders = () => ({
  "api-key": getEnv("ASTROS_PERP_API_KEY"),
});

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const pairs = await httpGet(`${BASE_URL}/pairs`, { headers: getHeaders() });

  const tradablePairs = pairs.data.filter((pair: any) => pair.tradable);

  const results = await Promise.all(
    tradablePairs.map(async (pair: any) => {
      const ticker: any = await httpGet(
        `${BASE_URL}/ticker/24hr?pairName=${pair.symbol}`,
        { headers: getHeaders() }
      );
      const volume = Number(ticker.data.amount);
      const feeRate =
        (Number(pair.takerTradeFeeRate) + Number(pair.makerTradeFeeRate)) / 100;
      return volume * feeRate;
    })
  );

  const totalFees = results.reduce((sum, fees) => sum + fees, 0);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(totalFees);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(totalFees);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-10-24",
    },
  },
};

export default adapter;
