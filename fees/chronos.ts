import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

const FACTORY_ADDRESS = '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722';

const methodology = {
  UserFees: "Users pay swap fees on each token swap, with rates varying by pool type (standard pools typically 0.3%, stable pools lower)",
  Fees: "All swap fees collected from token trades on Chronos",
  SupplySideRevenue: "All swap fees are distributed to liquidity providers who supply capital to the pools"
}

const breakdownMethodology = {
  Fees: {
    "Swap fees": "Fees charged on all token swaps through Chronos liquidity pools, with variable rates depending on pool type (typically 0.3% for standard pools, lower for stable pairs)"
  },
  UserFees: {
    "Trading fees": "Swap fees paid by traders on token exchanges, with variable rates depending on pool configuration (typically 0.3% for standard pools, lower for stable pairs)"
  },
  SupplySideRevenue: {
    "LP fees": "100% of swap fees distributed to liquidity providers as rewards for supplying capital to trading pools"
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...uniV2Exports({
      [CHAIN.ARBITRUM]: {
        factory: FACTORY_ADDRESS,
        userFeesRatio: 1,
        revenueRatio: 0,
      }
    }).adapter,
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
