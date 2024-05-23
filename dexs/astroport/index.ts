import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

// created a new adapter called astroport-v2
const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.TERRA]: {
      fetch: async (timestamp: number) => {
        return {
          timestamp,
          totalVolume: "32540550409.019516" // stop collect data on terra sinc 1653350400
        }
      },
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
  },
};

export default adapter;
