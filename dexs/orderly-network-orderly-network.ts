import type { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEAR]: {
      fetch: async (timestamp: number) => {
        return {
          timestamp: timestamp,
        };
      },
    },
  },
};

export default adapter;
