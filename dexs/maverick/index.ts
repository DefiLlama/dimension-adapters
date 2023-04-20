//  Maverick v1 volume
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./maverick";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: async () => 1676851200,
    },
    [CHAIN.ERA]: {
      fetch: fetchVolume(CHAIN.ERA),
      start: async () => 1337265,
    },
  },
};

export default adapter;
