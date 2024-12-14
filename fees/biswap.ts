import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { Adapter } from "../adapters/types";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({
        factory: "0x858e3312ed3a876947ea49d572a7c42de08af7ee",
        fees: 0.002
      }),
      start: '2021-05-24',
    },
  },
};

export default adapter;
