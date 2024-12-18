import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getFluidDailyFees } from "./fees";
import { getFluidDailyRevenue } from "./revenue";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const [dailyFees, dailyRevenue] = await Promise.all([
    getFluidDailyFees(options),
    getFluidDailyRevenue(options)
  ])
  return { dailyFees, dailyRevenue };
}

const adapter: Adapter = {
  version: 2,
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