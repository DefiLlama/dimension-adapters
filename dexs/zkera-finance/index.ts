import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./zkera";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TELOS]: {
      fetch: fetchVolume,
      start: 1627690586,
    },
  },
};
export default adapter;
