import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MANTA]: {
      fetch: getUniV3LogAdapter({
        factory: "0x8666EF9DC0cA5336147f1B11f2C4fC2ecA809B95",
      }),
      start: '2024-04-01',
    },
  },
};

export default adapter;
