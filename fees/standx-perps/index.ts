import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getDailyFees } from "../../dexs/standx";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(await getDailyFees(options), METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};


const methodology = {
  Fees: "Perps trading fees estimated as dailyVolume",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STANDX],
  start: '2025-11-24',
  methodology,
};

export default adapter;
