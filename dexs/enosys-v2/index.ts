import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: getUniV2LogAdapter({ factory: '0x28b70f6Ed97429E40FE9a9CD3EB8E86BCBA11dd4', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 }),
      start: '2023-09-05',
    },
  },
};

export default adapter;
