import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import v1Fetch from "./y2k-finance";
import v2Fetch from "./y2k-finance-v2";


const adapter: Adapter = {
  breakdown: {
    v1: {
      [CHAIN.ARBITRUM]: {
        fetch: v1Fetch(CHAIN.ARBITRUM),
        start: async () => 1667088000,
      },
    },
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Fetch,
        start: async () => 1685404800,
      },
    },
  },
};

export default adapter;
