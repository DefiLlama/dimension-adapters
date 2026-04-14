import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const FACTORY = "0x62B672E531f8c11391019F6fba0b8B6143504169";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: getUniV3LogAdapter({
        factory: FACTORY,
      }),
      start: "2023-10-17",
    },
  },
};

export default adapter;
