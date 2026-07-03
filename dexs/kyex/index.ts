import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  return {}
};

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-12-02', // website & twitter down
  adapter: {
    [CHAIN.ZETA]: {
      fetch,
      start: '2025-02-02',
    },
  },
};

export default adapter;