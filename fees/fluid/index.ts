import { Balances } from "@defillama/sdk";
import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import { BREAKDOWN_METHODOLOGY_FLUID, CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getFluidDailyFees } from "./fees";
import { getFluidDailyRevenue } from "./revenue";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue] = await Promise.all([
    getFluidDailyFees(options),
    getFluidDailyRevenue(options)
  ])

  const fees = await (dailyFees as Balances).getUSDValue();

  if (fees > 500_000) {
    throw new Error(`Fluid fees are too high: ${JSON.stringify(await (dailyFees as Balances).getUSDJSONs())}`);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, timestamp: options.startOfDay }
}

const adapter: Adapter = {
  version: 1,
  adapter: Object.entries(CONFIG_FLUID).reduce((acc, [chain, config]) => {
    acc[chain] = {
      start: config.dataStartTimestamp,
      fetch
    };
    return acc;
  }, {}),
  methodology: METHODOLOGY_FLUID,
  breakdownMethodology: BREAKDOWN_METHODOLOGY_FLUID,
}

export default adapter