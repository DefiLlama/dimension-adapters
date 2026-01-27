import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// created a new adapter called astroport-v2
const adapter: SimpleAdapter = {
  deadFrom: '2022-02-04',
  adapter: {
    [CHAIN.TERRA]: {
      fetch: async (timestamp: number) => {
        throw new Error("Not implemented");
      },
    },
  },
};

export default adapter;
