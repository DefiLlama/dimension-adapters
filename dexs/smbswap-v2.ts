import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      // PancakeSwap-v2 fork: 0.25% swap fee; no documented protocol take, all fees to LPs
      fetch: getUniV2LogAdapter({ factory: '0x2Af5c23798FEc8E433E11cce4A8822d95cD90565', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 }),
    },
  },
};

export default adapter;
