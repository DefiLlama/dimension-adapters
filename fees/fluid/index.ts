import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, Fetch } from "../../adapters/types";
import { CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getFluidDailyFees } from "./fees";
import { getFluidDailyRevenue } from "./revenue";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue] = await Promise.all([
    getFluidDailyFees(options),
    getFluidDailyRevenue(options)
  ])
  const fees = await (dailyFees as Balances).getUSDValue();
  if (fees > 1_000_000) {
    throw new Error(`Fluid fees are too high: ${JSON.stringify(await (dailyFees as Balances).getUSDJSONs())}`);
  }

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