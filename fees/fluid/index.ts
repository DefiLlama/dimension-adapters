import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CONFIG_FLUID, METHODOLOGY_FLUID } from "./config";
import { getFluidDailyFees } from "./fees";
import { getFluidDailyRevenue } from "./revenue";

const fetch: FetchV2 = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const [dailyFees, dailyRevenue] = await Promise.all([
    getFluidDailyFees(options, fromBlock, toBlock),
    getFluidDailyRevenue(options, fromBlock, toBlock)
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