import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./wagmi";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetchVolume(CHAIN.ERA),
      start: async () => 1681257600,
    },
    [CHAIN.FANTOM]: {
      fetch: fetchVolume(CHAIN.FANTOM),
      start: async () => 1681257600,
    },
    [CHAIN.KAVA]: {
      fetch: fetchVolume(CHAIN.KAVA),
      start: async () => 1694476800,
    },
  },
};
//
export default adapter;
