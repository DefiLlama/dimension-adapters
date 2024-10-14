import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

export default {
  [CHAIN.AVAX]: {
    fetch: getUniV3LogAdapter({
      factory: "0x62B672E531f8c11391019F6fba0b8B6143504169",
    }),
    start: 1697500800,
  },
};