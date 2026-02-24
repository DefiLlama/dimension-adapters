import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.METER]: {
      fetch: getUniV2LogAdapter({ factory: '0xb33dE8C0843F90655ad6249F20B473a627443d21' }),
    }
  },
};

export default adapter;
