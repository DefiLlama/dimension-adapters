//  Maverick v1 volume
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolume } from "./maverick";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: 1676851200,
    },
    [CHAIN.ERA]: {
      fetch: fetchVolume(CHAIN.ERA),
      start: 1681257600,
    },
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: 29241049,
    },
    [CHAIN.BASE]: {
      fetch: fetchVolume(CHAIN.BASE),
      start: 1489614,
    },
  },
};

export default adapter;
