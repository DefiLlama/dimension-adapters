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
      start: async () => 1681257600,
    },
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 29241049,
    },
    [CHAIN.BASE]: {
      fetch: fetchVolume(CHAIN.BASE),
      start: async () => 1489614,
    },
  },
};

export default adapter;
