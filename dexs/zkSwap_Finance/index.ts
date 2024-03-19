import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./zkswapFinance";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetchVolume(CHAIN.ERA),
      start: 1684842780,
    },
  },
};

export default adapter;
