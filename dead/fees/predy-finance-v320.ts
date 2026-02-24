import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async () => ({}),
      start: '2023-07-04',
    },
  },
  deadFrom: '2024-12-14',
};

export default adapter;
