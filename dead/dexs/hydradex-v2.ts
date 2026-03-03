import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2023-07-09',
  adapter: {
    [CHAIN.HYDRA]: {
      fetch: async (timestamp: number) => {
        return {
          timestamp
        }
      },
    },
  },
};

export default adapter;
