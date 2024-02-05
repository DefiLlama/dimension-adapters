import { Adapter, DISABLED_ADAPTER_KEY, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import disabledAdapter from "../helpers/disabledAdapter";

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  return {
    dailyFees: `${0}`,
    dailyRevenue: `${0}`,
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: async () => 1695081600,
    },
  }
}

export default adapter;
