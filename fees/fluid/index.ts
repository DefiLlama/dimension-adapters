import { Adapter, FetchOptions, Fetch } from "../../adapters/types";
import { CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getFluidDailyFees } from "./fees";
import { getFluidDailyRevenue } from "./revenue";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue] = await Promise.all([
    getFluidDailyFees(options),
    getFluidDailyRevenue(options)
  ])
  return { dailyFees, dailyRevenue, timestamp: options.startOfDay };
}

const adapter: Adapter = {
  version: 1,
  adapter: Object.entries(CONFIG_FLUID).reduce((acc, [chain, config]) => {
    acc[chain] = {
      meta: { methodology: METHODOLOGY_FLUID },
      start: config.dataStartTimestamp,
      fetch,
    };
    return acc;
  }, {}),
};

export default adapter