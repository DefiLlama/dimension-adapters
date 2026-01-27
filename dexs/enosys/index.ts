import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: getUniV3LogAdapter({
        factory: "0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de",
        userFeesRatio: 1,
        revenueRatio: 0.1,
        protocolRevenueRatio: 0.1,
      }),
      start: "2025-03-03",
    },
    [CHAIN.SONGBIRD]: {
      fetch: getUniV3LogAdapter({
        factory: "0x416F1CcBc55033Ae0133DA96F9096Fe8c2c17E7d",
        userFeesRatio: 1,
        revenueRatio: 0.1,
        protocolRevenueRatio: 0.1,
      }),
      start: "2024-09-24",
    },
  },
};

export default adapter;
