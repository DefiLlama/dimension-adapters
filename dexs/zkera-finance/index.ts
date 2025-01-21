import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./zkera";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TELOS]: {
      fetch: fetchVolume,
      start: '2021-07-31',
    },
  },
};
export default adapter;
