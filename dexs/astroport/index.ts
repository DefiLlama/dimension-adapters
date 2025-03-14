import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

// created a new adapter called astroport-v2
const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.TERRA]: {
      fetch: async (timestamp: number) => {
        throw new Error("Not implemented");
      },
    },
  },
};

export default adapter;
