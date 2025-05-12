import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import v1Fetch from "./y2k-finance";
import v2Fetch from "./y2k-finance-v2";


const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.ARBITRUM]: {
        fetch: v1Fetch,
        start: '2022-10-30',
      },
    },
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Fetch,
        start: '2023-05-30',
      },
    },
  },
};

export default adapter;
