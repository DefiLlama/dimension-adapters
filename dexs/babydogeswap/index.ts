import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default {
  ...uniV2Exports({
    [CHAIN.BSC]: {
      factory: '0x4693B62E5fc9c0a45F89D62e6300a03C85f43137',
      fees: 0.003,
      userFeesRatio: 1,
      revenueRatio: 0.1 / 0.3,
      protocolRevenueRatio: 1,
    }
  }),
  methodology: {
    Fees: "Fees collected from user trading fees",
    UserFees: "Users pays 0.3% of each swap. Different user fee discounts depending on Baby Doge wallet balance (up to 70% off). Calculation made with base 0.3%",
    Revenue: "Up to 0.1% of user fees are distributed to treasury",
    ProtocolRevenue: "Up to 0.1% of user fees are distributed to treasury",
    SupplySideRevenue: "A 0.2% user fees is distributed among LPs",
  },
};
