import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchV2 } from "./v2";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchV2,
      start: 1677110400
    },
  },
};

export default adapter;
