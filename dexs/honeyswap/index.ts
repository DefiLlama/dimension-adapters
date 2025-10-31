import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0x03daa61d8007443a6584e3d8f85105096543c19c' }), start: 1622173831 },
    [CHAIN.XDAI]: { fetch: getUniV2LogAdapter({ factory: '0xa818b4f111ccac7aa31d0bcc0806d64f2e0737d7' }), start: 1599191431 },
  },
}

export default adapter;
