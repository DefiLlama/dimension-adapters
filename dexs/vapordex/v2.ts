import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = "0x62B672E531f8c11391019F6fba0b8B6143504169";
export default {
  [CHAIN.AVAX]: {
    fetch: getUniV3LogAdapter({
      factory: FACTORY,
    }),
    start: "2023-10-17",
  },
  // [CHAIN.APECHAIN]: {
  //   fetch: getUniV3LogAdapter({
  //     factory: FACTORY,
  //   }),
  //   start: "2024-10-29",
  // },
};
