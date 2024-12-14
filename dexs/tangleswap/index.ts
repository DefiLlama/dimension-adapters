import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SHIMMER_EVM]: {
      fetch: getUniV3LogAdapter({
        factory: "0xdf7bA717FB0D5ce579252f05167cD96d0fA77bCb",
      }),
      start: '2023-10-04',
    },
  },
};

export default adapter;
