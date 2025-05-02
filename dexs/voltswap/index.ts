import { BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.METER]: {
        fetch: getUniV2LogAdapter({ factory: '0x56aD9A9149685b290ffeC883937caE191e193135' }),
      }
    },
    v2: {
      [CHAIN.METER]: {
        fetch: getUniV2LogAdapter({ factory: '0xb33dE8C0843F90655ad6249F20B473a627443d21' }),
      }
    },
  },
};

export default adapter;
