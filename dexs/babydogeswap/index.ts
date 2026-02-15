import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Users pay 0.3% of each swap (base rate, discounts available based on Baby Doge wallet balance up to 70% off)',
  },
  Fees: {
    'Trading fees': '0.3% fee collected from each swap on the DEX',
  },
  Revenue: {
    'Protocol fees': '0.1% of swap fees (33.3% of total fees) distributed to treasury',
  },
  ProtocolRevenue: {
    'Protocol fees': '0.1% of swap fees allocated to protocol treasury',
  },
  SupplySideRevenue: {
    'LP fees': '0.2% of swap fees (66.7% of total fees) distributed to liquidity providers',
  },
};

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
  breakdownMethodology,
};
