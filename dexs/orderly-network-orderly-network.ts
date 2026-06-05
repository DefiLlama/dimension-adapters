import type { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEAR]: {
      fetch: async (_: any) => {
        return {
        };
      },
    },
  },
};

export default adapter;
