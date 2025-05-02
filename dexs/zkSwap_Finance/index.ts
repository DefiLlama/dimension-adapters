import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./zkswapFinance";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetchVolume(CHAIN.ERA),
      start: '2023-05-23',
    },
  },
};

export default adapter;
