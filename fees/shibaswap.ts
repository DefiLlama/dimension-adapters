import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getUniV2LogAdapter({
        factory: "0x115934131916c8b277dd010ee02de363c09d037c",
      }),
      start: '2021-07-06',
    },
  },
};

export default adapter;
