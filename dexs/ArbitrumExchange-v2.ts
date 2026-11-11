import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0.8, protocolRevenueRatio: 0.8 }),
    },
  },
}

export default adapter;
