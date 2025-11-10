import { Balances } from "@defillama/sdk";
import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import { BREAKDOWN_METHODOLOGY_FLUID, CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getDailyFees } from "./fees";
import { getDailyRevenue, getDailyHoldersRevenue } from "./revenue";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const [dailyFees, dailyRevenue, dailyHoldersRevenue] = await Promise.all([
    getDailyFees(options),
    getDailyRevenue(options),
    getDailyHoldersRevenue(options)
  ])

  const fees = await (dailyFees as Balances).getUSDValue();

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, timestamp: options.startOfDay, dailyHoldersRevenue }
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