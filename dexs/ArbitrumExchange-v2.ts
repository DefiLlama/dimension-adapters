import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      // factory feeTo is set on-chain => stock uniV2 protocol share of 1/6 of swap fees
      fetch: getUniV2LogAdapter({ factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 1 / 6 }),
    },
  },
}

export default adapter;
