import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0x2Af5c23798FEc8E433E11cce4A8822d95cD90565' }),
    },
  },
};

export default adapter;
