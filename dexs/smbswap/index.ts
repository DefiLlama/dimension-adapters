import { BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter, } from "../../helpers/uniswap";

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.BSC]: { fetch: async () => ({}), deadFrom: "2025-03-21", },
    },
    v2: {
      [CHAIN.BSC]: {
        fetch: getUniV2LogAdapter({ factory: '0x2Af5c23798FEc8E433E11cce4A8822d95cD90565' }),
      }
    },
    v3: {
      [CHAIN.BSC]: {
        fetch: () => ({} as any),
        deadFrom: "2025-03-21",
      }
    },
    stableswap: {
      [CHAIN.BSC]: {
        fetch: () => ({} as any),
        deadFrom: "2025-03-21",
      }
    },
  },
};

export default adapter;
