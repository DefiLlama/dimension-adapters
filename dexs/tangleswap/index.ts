import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV3LogAdapter({
        factory: "0x86eea5C341ece8f96D403eA9fB4d184A6a94C0E1",
      }),
      start: 1696377600,
    },
  },
};

export default adapter;
