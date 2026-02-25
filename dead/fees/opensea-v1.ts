import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async () => ({}),
      start: '2022-06-12',
    },
  },
  deadFrom: '2022-06-12',
};

export default adapter;
