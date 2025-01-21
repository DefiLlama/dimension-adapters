import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

export default {
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: getUniV3LogAdapter({
        factory: "0xEECa0a86431A7B42ca2Ee5F479832c3D4a4c2644",
      }),
      start: '2023-12-12',
    },
  },
};
