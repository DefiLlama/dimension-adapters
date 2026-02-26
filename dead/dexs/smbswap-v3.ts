import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-04-01',
  adapter: {
    [CHAIN.BSC]: {
      fetch: () => ({} as any),
    },
  },
};

export default adapter;
