import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { Adapter } from "../../adapters/types";

const v2: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: getUniV2LogAdapter({
        factory: "0x62B672E531f8c11391019F6fba0b8B6143504169",
      }),
      start: 1697500800,
    },
  },
};

export default v2;
