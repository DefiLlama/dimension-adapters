import { CONFIG_FLUID_LITE } from "./config";
import { getFluidLiteDailyRevenue } from "./revenue";
import { CHAIN } from "../../helpers/chains";
import { Adapter, Fetch, FetchOptions } from "../../adapters/types";

const fetch: Fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyRevenue = await getFluidLiteDailyRevenue(options);

  return { dailyRevenue, timestamp: options.startOfDay };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: CONFIG_FLUID_LITE.startBlockNumber,
      fetch,
    },
  },
  methodology: CONFIG_FLUID_LITE.methodology,
};

export default adapter;
