import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: getUniV3LogAdapter({ factory: '0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de'}),
      start: '2025-03-03',
    },
  },
};

export default adapter;
