import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";
import { SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

const methodology = {
  UserFees: "Users pay a 0.3% fee on each swap",
  Fees: "All swap fees collected by the protocol",
  SupplySideRevenue: "All swap fees are distributed to liquidity providers"
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on all token swaps"
  },
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on all token swaps"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "100% of swap fees distributed to liquidity providers"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...uniV2Exports({
      [CHAIN.BSC]: {
        factory: '0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da',
        userFeesRatio: 1,
        revenueRatio: 0,
      }
    }).adapter,
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
