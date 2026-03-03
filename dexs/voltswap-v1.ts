import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.METER]: {
      fetch: getUniV2LogAdapter({ factory: '0x56aD9A9149685b290ffeC883937caE191e193135' }),
    }
  },
};

export default adapter;
